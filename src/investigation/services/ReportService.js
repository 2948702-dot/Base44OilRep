/**
 * Итоговый отчёт расследования (§39, §40 ТЗ).
 *
 * Здесь охраняется главное обещание продукта: отчёт не может утверждать больше, чем
 * установлено. Это обеспечивается тремя проверками при записи, а не формулировками
 * в промптах:
 *
 * 1. Вывод типа fact без ссылки на доказательство не сохраняется.
 * 2. Отчёт, сославшийся на несуществующий или неутверждённый вывод, отклоняется целиком.
 * 3. Выпуск отчёта невозможен без утверждённого человеком запроса final_report_release.
 */

import { nextCode } from '../domain/codes.js';
import {
  assertFindingHasEvidence,
  assertQualitativeConfidence,
  InvariantViolation,
} from '../engine/invariants.js';
import { createAgentContext } from '../agents/framework/AgentContext.js';
import { getAgent } from '../agents/registry.js';

export function createReportService({ repositories, scope, llm, approvals }) {
  function agentContext(caseId) {
    return createAgentContext({
      caseId,
      organizationId: scope.organizationId,
      actorId: scope.actorId,
      actorType: 'agent',
      repositories,
      llm,
    });
  }

  /** Собирает коды выводов, на которые ссылается отчёт, из всех разделов. */
  function citedFindingCodes(report) {
    const codes = new Set();
    for (const section of [...report.executive_summary, ...report.established_facts]) {
      for (const code of section.finding_codes ?? []) codes.add(code);
    }
    return [...codes];
  }

  return {
    /**
     * Классификация материалов дела в выводы. Выводы создаются черновиками:
     * утверждает их человек (§42 ТЗ).
     */
    async runFinalReview(caseId) {
      const context = agentContext(caseId);
      const agent = getAgent('final_reviewer');
      const result = await agent.runWithMetadata({}, context);
      const review = result.output;

      const [claims, evidence, issues, hypotheses, existing] = await Promise.all([
        repositories.claims.list({ case_id: caseId }),
        repositories.evidence.list({ case_id: caseId }),
        repositories.issues.list({ case_id: caseId }),
        repositories.hypotheses.list({ case_id: caseId }),
        repositories.findings.list({}, { includeDeleted: true }),
      ]);

      const claimByCode = new Map(claims.map((c) => [c.claim_code, c.id]));
      const evidenceByCode = new Map(evidence.map((e) => [e.evidence_code, e.id]));
      const issueByCode = new Map(issues.map((i) => [i.code, i.id]));
      const hypothesisByCode = new Map(hypotheses.map((h) => [h.code, h.id]));
      const codes = existing.map((f) => f.finding_code);

      const created = [];
      for (const finding of review.findings) {
        const code = nextCode('finding', codes);
        codes.push(code);

        const record = {
          case_id: caseId,
          finding_code: code,
          statement: finding.statement,
          finding_type: finding.finding_type,
          confidence: finding.confidence,
          supporting_claim_ids: finding.supporting_claim_codes
            .map((c) => claimByCode.get(c)).filter(Boolean),
          supporting_evidence_ids: finding.supporting_evidence_codes
            .map((c) => evidenceByCode.get(c)).filter(Boolean),
          contradicting_evidence_ids: finding.contradicting_evidence_codes
            .map((c) => evidenceByCode.get(c)).filter(Boolean),
          alternative_explanations: finding.alternative_explanations,
          issue_ids: finding.issue_codes.map((c) => issueByCode.get(c)).filter(Boolean),
          hypothesis_ids: finding.hypothesis_codes.map((c) => hypothesisByCode.get(c)).filter(Boolean),
          review_status: 'draft',
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        };

        assertQualitativeConfidence(record, 'confidence');

        // Ссылка на несуществующее доказательство не должна тихо превращаться
        // в вывод без доказательств: это и есть тот случай, ради которого
        // введён инвариант.
        if (finding.finding_type === 'fact'
          && finding.supporting_evidence_codes.length > 0
          && record.supporting_evidence_ids.length === 0) {
          throw new InvariantViolation(
            'FINDING_CITES_UNKNOWN_EVIDENCE',
            `Вывод «${finding.statement}» ссылается на доказательства `
            + `${finding.supporting_evidence_codes.join(', ')}, которых нет в деле`,
          );
        }
        assertFindingHasEvidence(record);

        created.push(await repositories.findings.create(record));
      }

      return {
        findings: created,
        unresolvedQuestions: review.unresolved_questions,
        readiness: review.report_readiness,
        readinessReason: review.readiness_reason,
        agentRunId: result.run.id,
      };
    },

    /** Утверждение вывода человеком. Без него вывод не попадёт в отчёт. */
    async approveFinding(findingId, note) {
      if (!note) throw new Error('Утверждение вывода требует обоснования');
      const approval = await approvals.request({
        approvalType: 'finding_approval',
        objectType: 'Finding',
        objectId: findingId,
      });
      await approvals.decide(approval.id, 'approved', note);
      return repositories.findings.update(findingId, {
        review_status: 'approved',
        approval_id: approval.id,
        approved_by: scope.actorId,
        approved_at: new Date().toISOString(),
      });
    },

    async rejectFinding(findingId, note) {
      if (!note) throw new Error('Отклонение вывода требует обоснования');
      return repositories.findings.update(findingId, { review_status: 'rejected' });
    },

    /**
     * Составление отчёта. Оформитель не имеет доступа к материалам дела, а результат
     * проверяется на то, что каждая ссылка ведёт к утверждённому выводу: так «Report
     * Writer не делает новых выводов» становится проверяемым свойством, а не пожеланием.
     */
    async generateReport(caseId, { unresolvedQuestions = [] } = {}) {
      const findings = await repositories.findings.list({ case_id: caseId });
      const approved = findings.filter((f) => f.review_status === 'approved');
      if (approved.length === 0) {
        throw new InvariantViolation(
          'REPORT_REQUIRES_APPROVED_FINDINGS',
          'Нет утверждённых выводов: отчёт не может быть составлен из непроверенного материала',
        );
      }

      const context = agentContext(caseId);
      const agent = getAgent('report_writer');
      const result = await agent.runWithMetadata({ unresolvedQuestions }, context);
      const report = result.output;

      const approvedCodes = new Set(approved.map((f) => f.finding_code));
      const cited = citedFindingCodes(report);
      const unknown = cited.filter((code) => !approvedCodes.has(code));
      if (unknown.length > 0) {
        throw new InvariantViolation(
          'REPORT_CITES_UNKNOWN_FINDING',
          `Отчёт ссылается на выводы, которых нет среди утверждённых: ${unknown.join(', ')}. `
          + 'Оформитель не вправе добавлять выводы.',
        );
      }

      const existingReports = await repositories.reports.list({ case_id: caseId });
      const version = existingReports.length + 1;
      const previous = existingReports.find((r) => r.status === 'released');

      return repositories.reports.create({
        case_id: caseId,
        version,
        status: 'draft',
        title: report.title,
        sections: report,
        finding_ids: approved.map((f) => f.id),
        cited_finding_codes: cited,
        unresolved_questions: report.unresolved_questions,
        methodology_version: context.methodologyVersion,
        generated_by_agent: agent.id,
        agent_run_id: result.run.id,
        supersedes_report_id: previous?.id ?? null,
      });
    },

    /**
     * Выпуск отчёта. Требует утверждённого человеком запроса final_report_release
     * и закрывает дело: после выпуска расследование считается завершённым.
     */
    async releaseReport(reportId, { caseService } = {}) {
      const report = await repositories.reports.get(reportId);
      if (!report) throw new Error(`Отчёт ${reportId} не найден`);

      const approval = await approvals.findApproved({
        approvalType: 'final_report_release',
        objectId: reportId,
      });
      if (!approval) {
        throw new InvariantViolation(
          'REPORT_RELEASE_REQUIRES_APPROVAL',
          'Выпуск итогового отчёта требует утверждённого запроса final_report_release',
        );
      }

      const released = await repositories.reports.update(reportId, {
        status: 'released',
        approval_id: approval.id,
        released_at: new Date().toISOString(),
        released_by: scope.actorId,
      });

      if (report.supersedes_report_id) {
        await repositories.reports.update(report.supersedes_report_id, { status: 'superseded' });
      }

      if (caseService) {
        await caseService.transitionStage(report.case_id, 'closed', 'Итоговый отчёт выпущен');
      }

      return released;
    },

    /** Запрос на выпуск отчёта: ставится следователем, решается утверждающим. */
    async requestRelease(caseId, reportId) {
      return approvals.request({
        approvalType: 'final_report_release',
        objectType: 'InvestigationReport',
        objectId: reportId,
        payload: { case_id: caseId },
      });
    },
  };
}
