/**
 * Прикладной сервис дела.
 *
 * Здесь собирается всё, что относится к жизненному циклу расследования: создание дела,
 * срез состояния, переходы стадий, запуск intake и планирования, сохранение результатов
 * агентов с проверкой методологических инвариантов.
 *
 * HTTP-слой и UI вызывают этот слой и не знают ни о базе, ни о промптах.
 */

import { formatCaseNumber, nextCode } from '../domain/codes.js';
import { evaluateTransition } from '../engine/stages.js';
import { computeNextBestActions } from '../engine/nextBestAction.js';
import { assertHypothesisDiversity, InvariantViolation } from '../engine/invariants.js';
import { createAgentContext } from '../agents/framework/AgentContext.js';
import { getAgent } from '../agents/registry.js';
import { MVP_AUTONOMY_LEVELS } from '../domain/enums.js';

export function createCaseService({ repositories, scope, llm, approvals }) {
  /**
   * Полный срез дела. Используется машиной стадий, движком следующих действий и
   * дашбордом: один источник состояния вместо трёх расходящихся выборок.
   */
  async function getSnapshot(caseId) {
    const [
      investigationCase, persons, allegations, issues, hypotheses, claims, evidence,
      contradictions, interviews, approvalList, tasks, agentRuns, moneyFlowEdges, findings, sources,
    ] = await Promise.all([
      repositories.cases.get(caseId),
      repositories.persons.list({ case_id: caseId }),
      repositories.allegations.list({ case_id: caseId }),
      repositories.issues.list({ case_id: caseId }),
      repositories.hypotheses.list({ case_id: caseId }),
      repositories.claims.list({ case_id: caseId }),
      repositories.evidence.list({ case_id: caseId }),
      repositories.contradictions.list({ case_id: caseId }),
      repositories.interviews.list({ case_id: caseId }),
      repositories.approvals.list({ case_id: caseId }),
      repositories.tasks.list({ case_id: caseId }),
      repositories.agentRuns.list({ case_id: caseId }),
      repositories.moneyFlowEdges.list({ case_id: caseId }),
      repositories.findings.list({ case_id: caseId }),
      repositories.sources.list({ case_id: caseId }),
    ]);

    return {
      investigationCase,
      persons,
      allegations,
      issues,
      hypotheses,
      claims,
      evidence,
      contradictions,
      interviews,
      approvals: approvalList,
      tasks,
      agentRuns,
      moneyFlowEdges,
      findings,
      sources,
    };
  }

  function agentContext(caseId, overrides = {}) {
    return createAgentContext({
      caseId,
      organizationId: scope.organizationId,
      actorId: scope.actorId,
      actorType: 'agent',
      repositories,
      llm,
      ...overrides,
    });
  }

  return {
    getSnapshot,

    /**
     * @param {{title: string, description: string, caseType?: string, severity?: string}} input
     */
    async createCase(input) {
      const year = new Date().getUTCFullYear();
      const existing = await repositories.cases.list({}, { includeDeleted: true });
      const sequence = existing.length + 1;

      const autonomyLevel = input.autonomyLevel ?? 'A1';
      if (!MVP_AUTONOMY_LEVELS.includes(autonomyLevel)) {
        throw new Error(
          `Уровень автономии ${autonomyLevel} не поддерживается в MVP: допустимы ${MVP_AUTONOMY_LEVELS.join(', ')}`,
        );
      }

      return repositories.cases.create({
        case_number: formatCaseNumber(year, sequence),
        title: input.title,
        description: input.description,
        case_type: input.caseType ?? 'other',
        severity: input.severity ?? 'medium',
        status: 'draft',
        current_stage: 'intake',
        created_by: scope.actorId,
        case_owner_id: input.caseOwnerId ?? scope.actorId,
        incident_start_at: input.incidentStartAt ?? null,
        incident_end_at: input.incidentEndAt ?? null,
        incident_time_precision: input.incidentTimePrecision ?? 'unknown',
        location: input.location ?? null,
        estimated_loss: input.estimatedLoss ?? null,
        currency: input.currency ?? null,
        confidentiality_level: input.confidentialityLevel ?? 'standard',
        autonomy_level: autonomyLevel,
        overall_confidence: 'very_low',
        current_round: 0,
        // Учебное дело симулятора помечается при создании и дальше живёт по общим
        // правилам. Пометка нужна, чтобы отчёт по учебному делу нельзя было выпустить
        // как настоящий и чтобы такие дела не смешивались с рабочими.
        is_training: input.isTraining === true,
      });
    },

    /**
     * Переход стадии. Условия перехода проверяются по данным дела: продвинуть
     * расследование «волевым решением» нельзя.
     */
    async transitionStage(caseId, nextStage, reason) {
      const snapshot = await getSnapshot(caseId);
      const current = snapshot.investigationCase?.current_stage ?? 'intake';
      const evaluation = evaluateTransition(current, nextStage, snapshot);

      if (!evaluation.allowed) {
        const details = evaluation.unmet.map((u) => u.describe).join('; ');
        throw new InvariantViolation(
          'STAGE_TRANSITION_BLOCKED',
          `${evaluation.reason}${details ? `: ${details}` : ''}`,
        );
      }

      const updated = await repositories.cases.update(caseId, {
        current_stage: nextStage,
        status: nextStage === 'closed' ? 'completed' : snapshot.investigationCase.status,
        finalized_at: nextStage === 'closed' ? new Date().toISOString() : null,
      });

      // Обоснование перехода записывается в журнал отдельным событием. Раньше оно
      // молча терялось: расследование продвигалось по стадиям, и почему — не знал
      // никто, включая того, кто потом читает дело.
      await repositories.audit.record({
        organization_id: scope.organizationId,
        case_id: caseId,
        actor: scope.actorId,
        actor_type: scope.actorType ?? 'user',
        timestamp: new Date().toISOString(),
        object_type: 'InvestigationCase',
        object_id: caseId,
        operation: 'status_change',
        old_value: { current_stage: current },
        new_value: { current_stage: nextStage },
        reason: reason ?? null,
      });

      return updated;
    },

    /**
     * Запуск Intake Analyst и сохранение извлечённой структуры.
     * Ничего не додумывается: unknowns сохраняются как открытые вопросы, а не как данные.
     */
    async runIntake(caseId, { description, documents } = {}) {
      const context = agentContext(caseId);
      const agent = getAgent('intake_analyst');
      const result = await agent.runWithMetadata({ description, documents }, context);
      const output = result.output;

      const existingAllegations = await repositories.allegations.list({}, { includeDeleted: true });
      const codes = existingAllegations.map((a) => a.code);

      const createdPersons = [];
      for (const person of output.persons) {
        createdPersons.push(await repositories.persons.create({
          case_id: caseId,
          name: person.name,
          role: person.role ?? null,
          job_title: person.job_title ?? null,
          organization: person.organization ?? null,
          participant_type: person.participant_type === 'subject' ? 'unknown' : person.participant_type,
          relationship_to_incident: person.relationship_to_incident ?? null,
          notes: person.mentioned_as ?? null,
        }));
      }

      const createdAllegations = [];
      for (const allegation of output.allegations) {
        const code = nextCode('allegation', codes);
        codes.push(code);
        createdAllegations.push(await repositories.allegations.create({
          case_id: caseId,
          code,
          description: allegation.description,
          amount: allegation.amount ?? null,
          currency: allegation.currency ?? null,
          status: 'reported',
        }));
      }

      await repositories.cases.update(caseId, { status: 'intake' });

      return {
        persons: createdPersons,
        allegations: createdAllegations,
        unknowns: output.unknowns,
        knownSources: output.known_sources,
        agentRunId: result.run.id,
        injectionMarkers: result.injectionMarkers,
      };
    },

    /**
     * Запуск Investigation Planner. План отклоняется целиком, если он не удовлетворяет
     * методологии: меньше трёх версий или версия без опровергающего доказательства.
     */
    async runPlanning(caseId) {
      const context = agentContext(caseId);
      const agent = getAgent('investigation_planner');
      const result = await agent.runWithMetadata({}, context);
      const plan = result.output;

      assertHypothesisDiversity(plan.hypotheses);

      const [existingIssues, existingHypotheses] = await Promise.all([
        repositories.issues.list({}, { includeDeleted: true }),
        repositories.hypotheses.list({}, { includeDeleted: true }),
      ]);
      const issueCodes = existingIssues.map((i) => i.code);
      const hypothesisCodes = existingHypotheses.map((h) => h.code);

      const createdIssues = [];
      for (const issue of plan.issues) {
        const code = nextCode('issue', issueCodes);
        issueCodes.push(code);
        createdIssues.push(await repositories.issues.create({
          case_id: caseId,
          code,
          question: issue.question,
          description: issue.description,
          status: 'open',
          priority: issue.priority,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        }));
      }

      const createdHypotheses = [];
      for (const hypothesis of plan.hypotheses) {
        const code = nextCode('hypothesis', hypothesisCodes);
        hypothesisCodes.push(code);
        const created = await repositories.hypotheses.create({
          case_id: caseId,
          code,
          description: hypothesis.description,
          type: hypothesis.type,
          status: 'active',
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
          support_score: 0,
          contradiction_score: 0,
          confidence: 'very_low',
          evidence_that_would_support: hypothesis.evidence_that_would_support,
          evidence_that_would_contradict: hypothesis.evidence_that_would_contradict,
          missing_evidence: hypothesis.evidence_that_would_support,
          last_reviewed_at: new Date().toISOString(),
        });
        createdHypotheses.push(created);
        await repositories.hypothesisRevisions.create({
          case_id: caseId,
          hypothesis_id: created.id,
          revision: 1,
          old_status: null,
          new_status: 'active',
          reason: 'Версия создана планировщиком расследования',
          changed_by_agent: agent.id,
          agent_run_id: result.run.id,
          changed_at: new Date().toISOString(),
        });
      }

      const createdTasks = [];
      for (const request of plan.evidence_requests) {
        createdTasks.push(await repositories.tasks.create({
          case_id: caseId,
          title: request.description,
          description: request.holder ? `Держатель: ${request.holder}` : null,
          task_type: 'request_document',
          status: 'proposed',
          priority: request.urgency === 'high' ? 'high' : 'medium',
          expected_information_gain: request.expected_information_gain,
          urgency: request.urgency,
          reason: `Разрешает: ${(request.resolves ?? []).join(', ') || 'не указано'}`,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        }));
      }

      await repositories.cases.update(caseId, { status: 'planning' });

      return {
        issues: createdIssues,
        hypotheses: createdHypotheses,
        tasks: createdTasks,
        objectives: plan.objectives,
        interviewOrder: plan.interview_order,
        agentRunId: result.run.id,
      };
    },

    /**
     * Независимая проверка основной версии. Результат сохраняется в поле гипотезы и
     * порождает задачи, а не заменяет собой вывод следователя.
     */
    async runRedTeamReview(caseId, hypothesisId) {
      const context = agentContext(caseId);
      const agent = getAgent('red_team_investigator');
      const result = await agent.runWithMetadata({ hypothesisId }, context);
      const review = result.output;

      await repositories.hypotheses.update(hypothesisId, {
        red_team_notes: JSON.stringify({
          verdict: review.verdict,
          verdict_reason: review.verdict_reason,
          flaws: review.reasoning_flaws,
          alternatives: review.alternative_explanations,
        }),
        last_reviewed_at: new Date().toISOString(),
      });

      const createdTasks = [];
      for (const flaw of review.reasoning_flaws) {
        createdTasks.push(await repositories.tasks.create({
          case_id: caseId,
          title: flaw.what_would_settle_it,
          description: flaw.description,
          task_type: 'other',
          status: 'proposed',
          priority: 'high',
          hypothesis_id: hypothesisId,
          expected_information_gain: 'high',
          reason: `Red Team: ${flaw.flaw_type}`,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        }));
      }

      return { review, tasks: createdTasks, agentRunId: result.run.id };
    },

    /**
     * Рекомендованные следующие действия. Детерминированные правила движка дополняются
     * предложениями Case Manager, но не заменяются ими.
     */
    async getNextBestActions(caseId, { includeAgentSuggestions = false } = {}) {
      const snapshot = await getSnapshot(caseId);
      const actions = computeNextBestActions(snapshot);

      if (!includeAgentSuggestions) return { actions, agentSuggestions: null };

      const context = agentContext(caseId);
      const agent = getAgent('case_manager');
      const suggestion = await agent.run({}, context);
      return { actions, agentSuggestions: suggestion };
    },

    /**
     * Требует утверждения человеком перед отправкой первого набора интервью (§42 ТЗ).
     */
    async requestInterviewDispatchApproval(caseId, interviewIds) {
      return approvals.request({
        approvalType: 'interview_dispatch',
        objectType: 'Interview',
        payload: { case_id: caseId, interview_ids: interviewIds },
      });
    },
  };
}
