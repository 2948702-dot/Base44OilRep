/**
 * Аналитический цикл расследования (§67 ТЗ).
 *
 * Извлечение утверждений → хронология → противоречия → пересмотр версий →
 * независимая проверка → планирование следующего раунда.
 *
 * Сервис не только запускает агентов, но и охраняет методологию на записи: агент может
 * вернуть формально корректный JSON, нарушающий правило расследования, и такой результат
 * не должен попасть в дело. Проверки здесь — не дублирование промпта, а последняя граница.
 */

import { nextCode } from '../domain/codes.js';
import {
  assertQualitativeConfidence,
  assertPrecisionNotInflated,
  InvariantViolation,
} from '../engine/invariants.js';
import { FOLLOW_UP_PIPELINE, evaluateFollowUpNeed } from '../engine/followUpLoop.js';
import { createAgentContext } from '../agents/framework/AgentContext.js';
import { getAgent } from '../agents/registry.js';

export function createAnalysisService({ repositories, scope, llm, approvals }) {
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

  /** Коды утверждений в идентификаторы: агенты оперируют кодами, база — идентификаторами. */
  async function claimCodeMap(caseId) {
    const claims = await repositories.claims.list({ case_id: caseId });
    return new Map(claims.map((c) => [c.claim_code, c]));
  }

  return {
    /**
     * Хронология. Существующие события не удаляются и не переписываются: повторный
     * прогон добавляет новые и дополняет конкурирующие версии, потому что старая
     * версия времени остаётся частью материалов дела.
     */
    async runTimeline(caseId) {
      const context = agentContext(caseId);
      const agent = getAgent('timeline_analyst');
      const result = await agent.runWithMetadata({}, context);

      const [byCode, persons, existing] = await Promise.all([
        claimCodeMap(caseId),
        repositories.persons.list({ case_id: caseId }),
        repositories.events.list({}, { includeDeleted: true }),
      ]);
      const personByName = new Map(persons.map((p) => [p.name, p.id]));
      const codes = existing.map((e) => e.event_code);

      // Сопоставлять перестроенную хронологию можно только с живыми событиями.
      // Удалённое событие, совпавшее описанием, прежде «оживало» скрытно: запись
      // обновлялась, но оставалась невидимой, а нового события не появлялось —
      // событие исчезало из хронологии совсем.
      const live = existing.filter((e) => !e.deleted_at);
      const claimsKey = (ids) => [...(ids ?? [])].sort().join('|');
      const existingByClaims = new Map(
        live.filter((e) => (e.source_claim_ids ?? []).length > 0)
          .map((e) => [claimsKey(e.source_claim_ids), e]),
      );
      const existingByDescription = new Map(live.map((e) => [e.description, e]));

      const created = [];
      const updated = [];

      for (const event of result.output.events) {
        const sourceClaims = event.source_claim_codes
          .map((code) => byCode.get(code))
          .filter(Boolean);

        if (sourceClaims.length === 0) {
          throw new InvariantViolation(
            'EVENT_REQUIRES_CLAIM',
            `Событие «${event.description}» ссылается на несуществующие утверждения: `
            + event.source_claim_codes.join(', '),
          );
        }
        assertQualitativeConfidence(event, 'confidence');

        const payload = {
          case_id: caseId,
          event_type: event.event_type,
          description: event.description,
          start_at: event.start_at,
          end_at: event.end_at,
          time_precision: event.time_precision,
          location: event.location,
          participant_person_ids: event.participant_names
            .map((name) => personByName.get(name))
            .filter(Boolean),
          source_claim_ids: sourceClaims.map((c) => c.id),
          confidence: event.confidence,
          competing_versions: event.competing_versions ?? [],
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        };

        // Опорой сопоставления служит набор утверждений, на которых стоит событие:
        // формулировку описания агент меняет от прогона к прогону, и совпадение
        // по строке теряет событие при любой переформулировке.
        const previous = existingByClaims.get(claimsKey(payload.source_claim_ids))
          ?? existingByDescription.get(event.description);
        if (previous) {
          // Прежняя версия времени сохраняется как конкурирующая, а не затирается.
          const preserved = [
            ...(previous.competing_versions ?? []),
            ...(payload.competing_versions ?? []),
          ];
          // Повышение точности допустимо только на новом материале. Иначе второй
          // прогон цикла тихо превращает «в тот день» в «14:30» — ровно то, что
          // методология запрещает, и ровно то, чего никто не заметит.
          const previousClaims = new Set(previous.source_claim_ids ?? []);
          const restsOnNewClaims = (payload.source_claim_ids ?? [])
            .some((id) => !previousClaims.has(id));
          if (!restsOnNewClaims) assertPrecisionNotInflated(previous, payload);

          const timeChanged = previous.start_at !== payload.start_at
            || previous.end_at !== payload.end_at;
          if (timeChanged) {
            preserved.push({
              start_at: previous.start_at,
              end_at: previous.end_at,
              time_precision: previous.time_precision,
              source_claim_codes: [],
              note: 'Версия предыдущего прогона хронологии',
            });
          }
          updated.push(await repositories.events.update(previous.id, {
            ...payload,
            competing_versions: preserved,
          }));
        } else {
          const code = nextCode('event', codes);
          codes.push(code);
          created.push(await repositories.events.create({ ...payload, event_code: code }));
        }
      }

      return {
        events: created,
        updatedEvents: updated,
        gaps: result.output.gaps,
        impossibleSequences: result.output.impossible_sequences,
        agentRunId: result.run.id,
      };
    },

    /**
     * Поиск противоречий. Дубли не создаются: пара утверждений, уже зафиксированная
     * как противоречие, повторно не записывается.
     */
    async runContradictionScan(caseId) {
      const context = agentContext(caseId);
      const agent = getAgent('contradiction_analyst');
      const result = await agent.runWithMetadata({}, context);

      const [byCode, existing] = await Promise.all([
        claimCodeMap(caseId),
        repositories.contradictions.list({}, { includeDeleted: true }),
      ]);
      const codes = existing.map((x) => x.contradiction_code);
      const seen = new Set(existing.map((x) => [x.claim_a_id, x.claim_b_id].sort().join('|')));

      const created = [];
      for (const item of result.output.contradictions) {
        const claimA = byCode.get(item.claim_a_code);
        const claimB = byCode.get(item.claim_b_code);
        if (!claimA || !claimB) {
          throw new InvariantViolation(
            'CONTRADICTION_REQUIRES_CLAIMS',
            `Противоречие ссылается на несуществующие утверждения: ${item.claim_a_code}, ${item.claim_b_code}`,
          );
        }
        if (claimA.id === claimB.id) continue;

        const key = [claimA.id, claimB.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const code = nextCode('contradiction', codes);
        codes.push(code);

        created.push(await repositories.contradictions.create({
          case_id: caseId,
          contradiction_code: code,
          claim_a_id: claimA.id,
          claim_b_id: claimB.id,
          type: item.type,
          severity: item.severity,
          description: item.description,
          resolution_status: 'open',
          recommended_checks: item.recommended_checks,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        }));
      }

      return { contradictions: created, agentRunId: result.run.id };
    },

    /**
     * Подтверждение утверждений (§32 ТЗ).
     *
     * Оценивается каждое утверждение отдельно: сколько источников его поддерживают,
     * независимы ли они, есть ли объективное доказательство. Человек не оценивается
     * вовсе — ни здесь, ни где-либо ещё в системе.
     */
    async runCorroboration(caseId) {
      const context = agentContext(caseId);
      const agent = getAgent('corroboration_agent');
      const result = await agent.runWithMetadata({}, context);

      const [byCode, evidence, existingLinks] = await Promise.all([
        claimCodeMap(caseId),
        repositories.evidence.list({ case_id: caseId }),
        repositories.claimEvidenceLinks.list({ case_id: caseId }),
      ]);
      const evidenceByCode = new Map(evidence.map((e) => [e.evidence_code, e]));
      const seenLinks = new Set(existingLinks.map((l) => `${l.claim_id}|${l.evidence_id}`));

      const updated = [];
      for (const assessment of result.output.assessments) {
        const claim = byCode.get(assessment.claim_code);
        if (!claim) continue;

        // Утверждение не может считаться проверенным без объективного материала:
        // согласие двух людей — это подтверждение, но не проверка.
        const hasObjective = assessment.objective_evidence_codes
          .some((code) => evidenceByCode.has(code));
        const verification = !hasObjective && assessment.verification_status === 'verified'
          ? 'partially_verified'
          : assessment.verification_status;

        updated.push(await repositories.claims.update(claim.id, {
          corroboration_status: assessment.corroboration_status,
          verification_status: verification,
        }));
      }

      const links = [];
      for (const link of result.output.evidence_links) {
        const claim = byCode.get(link.claim_code);
        const item = evidenceByCode.get(link.evidence_code);
        if (!claim || !item) {
          throw new InvariantViolation(
            'LINK_REQUIRES_CLAIM_AND_EVIDENCE',
            `Связь ссылается на несуществующие объекты: ${link.claim_code} ↔ ${link.evidence_code}`,
          );
        }
        const key = `${claim.id}|${item.id}`;
        if (seenLinks.has(key)) continue;
        seenLinks.add(key);

        links.push(await repositories.claimEvidenceLinks.create({
          case_id: caseId,
          claim_id: claim.id,
          evidence_id: item.id,
          relation: link.relation,
          strength: link.strength,
          explanation: link.explanation,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
          reviewed_by_human: false,
        }));
      }

      return { claims: updated, links, agentRunId: result.run.id };
    },

    /**
     * Финансовый контур (§33 ТЗ).
     *
     * Ожидаемая и фактическая цепочки движения средств сохраняются раздельно: сравнение
     * норматива с фактом и есть содержание финансового расследования.
     *
     * Звено без объективного финансового материала записывается как неподтверждённое
     * независимо от того, что вернул агент: правдоподобие подтверждением не является.
     */
    async runFinancialAnalysis(caseId) {
      const context = agentContext(caseId);
      const agent = getAgent('financial_investigator');
      const result = await agent.runWithMetadata({}, context);
      const analysis = result.output;

      const [evidence, existingEdges, existingTransactions] = await Promise.all([
        repositories.evidence.list({ case_id: caseId }),
        repositories.moneyFlowEdges.list({ case_id: caseId }),
        repositories.transactions.list({}, { includeDeleted: true }),
      ]);
      const evidenceByCode = new Map(evidence.map((e) => [e.evidence_code, e]));
      const transactionCodes = existingTransactions.map((t) => t.transaction_code);
      const seenEdges = new Set(existingEdges.map(
        (e) => `${e.flow_type}|${e.source_entity}|${e.destination_entity}|${e.sequence}`,
      ));

      const edges = [];

      for (const step of analysis.expected_flow) {
        const key = `expected|${step.source_entity}|${step.destination_entity}|${step.sequence}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        edges.push(await repositories.moneyFlowEdges.create({
          case_id: caseId,
          sequence: step.sequence,
          source_entity: step.source_entity,
          destination_entity: step.destination_entity,
          amount: step.amount,
          currency: step.currency,
          occurred_at: step.expected_at,
          time_precision: 'unknown',
          evidence_ids: [],
          // Ожидаемое движение — это норматив, а не наблюдение, и подтверждённым
          // быть не может по определению.
          verification_status: 'unverified',
          flow_type: 'expected',
          notes: step.basis,
        }));
      }

      const transactions = [];
      for (const step of analysis.actual_flow) {
        const evidenceIds = step.evidence_codes
          .map((code) => evidenceByCode.get(code)?.id)
          .filter(Boolean);

        const hasObjectiveEvidence = evidenceIds.length > 0;
        const verification = hasObjectiveEvidence
          ? step.verification_status
          : (step.verification_status === 'contradicted' ? 'contradicted' : 'unverified');

        const key = `actual|${step.source_entity}|${step.destination_entity}|${step.sequence}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);

        edges.push(await repositories.moneyFlowEdges.create({
          case_id: caseId,
          sequence: step.sequence,
          source_entity: step.source_entity,
          destination_entity: step.destination_entity,
          amount: step.amount,
          currency: step.currency,
          occurred_at: step.occurred_at,
          time_precision: step.time_precision,
          evidence_ids: evidenceIds,
          verification_status: verification,
          flow_type: 'actual',
          notes: step.claim_codes.length > 0 ? `Со слов: ${step.claim_codes.join(', ')}` : null,
        }));

        // Каждое фактическое звено становится операцией: движение денег должно быть
        // видно в деле как объект, а не только как ребро схемы.
        const code = nextCode('transaction', transactionCodes);
        transactionCodes.push(code);
        transactions.push(await repositories.transactions.create({
          case_id: caseId,
          transaction_code: code,
          payer: step.source_entity,
          receiver: step.destination_entity,
          amount: step.amount,
          currency: step.currency,
          actual_at: step.occurred_at,
          payment_method: 'unknown',
          verification_status: verification,
          notes: step.claim_codes.length > 0 ? `Со слов: ${step.claim_codes.join(', ')}` : null,
        }));
      }

      // Недостающие финансовые материалы становятся задачами: разрыв, о котором никто
      // не запросил документ, останется разрывом навсегда.
      const tasks = [];
      for (const item of analysis.missing_financial_evidence) {
        tasks.push(await repositories.tasks.create({
          case_id: caseId,
          title: item.description,
          description: item.holder ? `Держатель: ${item.holder}` : null,
          task_type: 'request_bank_statement',
          status: 'proposed',
          priority: 'high',
          expected_information_gain: 'very_high',
          reason: `Финансовый разрыв: ${item.would_resolve}`,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        }));
      }

      return {
        analysis,
        edges,
        transactions,
        tasks,
        unverifiedEdges: edges.filter((e) => e.verification_status === 'unverified').length,
        agentRunId: result.run.id,
      };
    },

    /**
     * Пересмотр версий. Смена статуса пишется в историю; исключение версии агентом
     * не допускается ни при каких условиях — это решение человека (§8, §34, §42 ТЗ).
     */
    async runHypothesisReview(caseId) {
      const context = agentContext(caseId);
      const agent = getAgent('hypothesis_analyst');
      const result = await agent.runWithMetadata({}, context);

      const hypotheses = await repositories.hypotheses.list({ case_id: caseId });
      const byCode = new Map(hypotheses.map((h) => [h.code, h]));
      const revisions = await repositories.hypothesisRevisions.list({ case_id: caseId });

      const updated = [];
      for (const analysis of result.output.analyses) {
        const hypothesis = byCode.get(analysis.hypothesis_code);
        if (!hypothesis) continue;

        if (analysis.status === 'eliminated') {
          throw new InvariantViolation(
            'AGENT_CANNOT_ELIMINATE_HYPOTHESIS',
            `Агент попытался исключить версию ${hypothesis.code}. `
            + 'Исключение версии требует решения человека и утверждённого запроса hypothesis_closure.',
          );
        }
        assertQualitativeConfidence(analysis, 'confidence');

        const changed = analysis.status !== hypothesis.status;

        updated.push(await repositories.hypotheses.update(hypothesis.id, {
          status: analysis.status,
          confidence: analysis.confidence,
          support_score: analysis.supporting_claim_ids.length + analysis.supporting_evidence_ids.length,
          contradiction_score: analysis.contradicting_claim_ids.length
            + analysis.contradicting_evidence_ids.length,
          missing_evidence: analysis.missing_evidence,
          alternative_explanations: analysis.alternative_explanations,
          last_reviewed_at: new Date().toISOString(),
        }));

        if (changed) {
          const previousCount = revisions.filter((r) => r.hypothesis_id === hypothesis.id).length;
          await repositories.hypothesisRevisions.create({
            case_id: caseId,
            hypothesis_id: hypothesis.id,
            revision: previousCount + 1,
            old_status: hypothesis.status,
            new_status: analysis.status,
            reason: analysis.status_change_reason,
            changed_by_agent: agent.id,
            agent_run_id: result.run.id,
            snapshot: {
              supporting_claims: analysis.supporting_claim_ids,
              contradicting_claims: analysis.contradicting_claim_ids,
              unexplained_evidence: analysis.unexplained_evidence,
            },
            changed_at: new Date().toISOString(),
          });
        }
      }

      // Выжившие считаются по всем версиям дела, а не по тем, которые агент упомянул
      // в этом прогоне. Иначе анализ одной основной версии выглядел бы как исчезновение
      // всех альтернатив и валил бы весь аналитический цикл на ровном месте.
      const allHypotheses = await repositories.hypotheses.list({ case_id: caseId });
      const surviving = allHypotheses.filter(
        (h) => h.status !== 'eliminated' && h.type !== 'primary',
      );
      if (updated.length > 0 && surviving.length === 0) {
        throw new InvariantViolation(
          'ALTERNATIVES_MUST_SURVIVE',
          'После пересмотра не осталось ни одной альтернативной версии: расследование '
          + 'потеряло проверку основной версии',
        );
      }

      return { hypotheses: updated, agentRunId: result.run.id };
    },

    /**
     * Планирование следующего раунда. Вопросы создаются черновиками; чувствительные
     * и раскрывающие чужие показания уходят на утверждение человеку.
     */
    async runFollowUpPlanning(caseId, { nextRound } = {}) {
      const context = agentContext(caseId);
      const agent = getAgent('follow_up_planner');
      const round = nextRound ?? ((await repositories.cases.get(caseId))?.current_round ?? 1) + 1;
      const result = await agent.runWithMetadata({ nextRound: round }, context);

      const persons = await repositories.persons.list({ case_id: caseId });
      const personByName = new Map(persons.map((p) => [p.name, p]));

      const planned = [];
      const unknownTargets = [];

      for (const priority of result.output.priorities) {
        const person = personByName.get(priority.target_person_name);
        if (!person) {
          unknownTargets.push(priority.target_person_name);
          continue;
        }
        planned.push({
          person,
          reasonCategory: priority.reason_category,
          questions: priority.questions.map((q) => ({
            question: q.question,
            question_type: q.question_type,
            purpose: q.purpose,
            // Раскрытие чужих показаний всегда считается чувствительным, даже если
            // агент так не пометил: цена ошибки здесь несимметрична.
            sensitive: Boolean(q.sensitive || q.reveals_other_testimony),
            generated_by: 'agent',
            generated_by_agent: agent.id,
            agent_run_id: result.run.id,
          })),
        });
      }

      const tasks = [];
      for (const request of result.output.evidence_requests) {
        tasks.push(await repositories.tasks.create({
          case_id: caseId,
          title: request.description,
          description: `Разрешает: ${request.resolves}`,
          task_type: 'request_document',
          status: 'proposed',
          priority: 'high',
          expected_information_gain: request.expected_information_gain,
          reason: `Follow-Up Planner, раунд ${round}`,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
        }));
      }

      return {
        round,
        planned,
        tasks,
        unknownTargets,
        recommendStop: result.output.recommend_stop,
        stopReason: result.output.stop_reason,
        agentRunId: result.run.id,
      };
    },

    /**
     * Полный аналитический цикл. Каждый шаг выполняется отдельно и его результат
     * фиксируется: обрыв на середине оставляет уже полученные выводы в деле, а не
     * теряет их.
     */
    async runAnalysisCycle(caseId, { includeRedTeam = true, caseService } = {}) {
      const steps = [];

      const timeline = await this.runTimeline(caseId);
      steps.push({ step: 'timeline', events: timeline.events.length, gaps: timeline.gaps.length });

      const contradictions = await this.runContradictionScan(caseId);
      steps.push({ step: 'contradiction_analysis', found: contradictions.contradictions.length });

      // Подтверждение идёт до пересмотра версий: версия, оценённая по неподтверждённым
      // утверждениям, получила бы уверенность, которой ничто не соответствует.
      const corroboration = await this.runCorroboration(caseId);
      steps.push({
        step: 'corroboration',
        claims: corroboration.claims.length,
        links: corroboration.links.length,
      });

      const review = await this.runHypothesisReview(caseId);
      steps.push({ step: 'hypothesis_review', reviewed: review.hypotheses.length });

      let redTeam = null;
      if (includeRedTeam && caseService) {
        const primary = review.hypotheses.find((h) => h.type === 'primary')
          ?? (await repositories.hypotheses.list({ case_id: caseId })).find((h) => h.type === 'primary');
        if (primary) {
          redTeam = await caseService.runRedTeamReview(caseId, primary.id);
          steps.push({ step: 'adversarial_review', verdict: redTeam.review.verdict });
        }
      }

      const followUp = await this.runFollowUpPlanning(caseId);
      steps.push({
        step: 'follow_up_planning',
        people: followUp.planned.length,
        recommend_stop: followUp.recommendStop,
      });

      const snapshot = await caseService?.getSnapshot(caseId);
      const need = snapshot ? evaluateFollowUpNeed(snapshot) : null;

      return {
        pipeline: FOLLOW_UP_PIPELINE.map((s) => s.step),
        steps,
        timeline,
        contradictions,
        corroboration,
        review,
        redTeam,
        followUp,
        nextRoundNeeded: need,
      };
    },

    /**
     * Ставит следующий раунд на утверждение человеком: без approved-запроса
     * ссылки участникам не выдаются (§42 ТЗ).
     */
    async requestFollowUpApproval(caseId, plan) {
      return approvals.request({
        approvalType: 'interview_dispatch',
        objectType: 'Interview',
        payload: {
          case_id: caseId,
          round: plan.round,
          people: plan.planned.map((p) => ({
            person_id: p.person.id,
            name: p.person.name,
            reason: p.reasonCategory,
            questions: p.questions.length,
            sensitive_questions: p.questions.filter((q) => q.sensitive).length,
          })),
        },
      });
    },
  };
}
