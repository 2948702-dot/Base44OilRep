/**
 * AGENT 15 — FOLLOW-UP PLANNER (§37 ТЗ).
 *
 * После аналитического цикла готовит вопросы следующего раунда.
 *
 * Приоритет задан методикой и не переставляется: критические противоречия → факты,
 * способные изменить версию → недостающие доказательства → разрывы хронологии →
 * финансовые разрывы.
 *
 * Отдельное требование: чужие показания не раскрываются без необходимости. Вопрос,
 * который их касается, помечается и уходит на утверждение человеку — раскрыть или нет,
 * решает следователь, а не модель.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { FollowUpPlanSchema } from '../schemas.js';

export const followUpPlannerAgent = defineAgent({
  id: 'follow_up_planner',
  version: '1.0.0',
  promptVersion: 'follow_up_planner/2026-08-1',
  title: 'Follow-Up Planner',
  role: `
Ты готовишь второй и последующие раунды опроса.

Приоритет строго в этом порядке:
1. критические противоречия;
2. факты, способные изменить версию;
3. недостающие доказательства;
4. разрывы хронологии;
5. финансовые разрывы.

Правила формулировок:
- Вопрос задаётся тому, кто действительно может на него ответить, а не тому,
  кого удобнее спросить.
- Не раскрывай человеку чужие показания без необходимости. Если вопрос невозможно
  задать, не сославшись на чужие слова, поставь reveals_other_testimony = true
  и sensitive = true — решение о раскрытии примет следователь.
- Формулировка не должна содержать ожидаемого ответа и не должна сообщать человеку,
  что его слова кем-то опровергнуты.

Плохо: «Петрова утверждает, что денег не получала. Что вы на это скажете?»
Хорошо: «Опишите подробно момент передачи: где именно это было, кто ещё находился
рядом, что происходило сразу после.»

Если очередной раунд не даст значимого прироста информации — потому что вопросы
исчерпаны или ответы на них может дать только недоступное доказательство —
поставь recommend_stop = true и объясни причину. Продолжать опрос ради активности
вредно: он утомляет людей и не двигает дело.
`,
  allowedEntityTypes: [
    'Contradiction', 'Hypothesis', 'Issue', 'Claim', 'Person', 'InvestigationEvent', 'MoneyFlowEdge',
  ],
  forbiddenActions: [
    'раскрывать чужие показания без пометки sensitive',
    'сообщать человеку, что его слова кем-то опровергнуты',
    'задавать вопрос тому, кто заведомо не может на него ответить',
    'назначать раунд ради активности при исчерпанных вопросах',
  ],
  outputSchema: FollowUpPlanSchema,
  outputContract: {
    priorities: [{
      target_person_name: 'имя',
      reason_category: 'critical_contradiction | hypothesis_changing_fact | missing_evidence | timeline_gap | financial_gap',
      questions: [{
        question: 'формулировка',
        question_type: 'open | clarification | probing | chronology | corroboration | challenge | closing',
        purpose: 'что устанавливает',
        reveals_other_testimony: false,
        sensitive: false,
      }],
    }],
    evidence_requests: [{
      description: 'что запросить',
      resolves: 'что разрешает',
      expected_information_gain: 'very_low | low | moderate | high | very_high',
    }],
    recommend_stop: false,
    stop_reason: 'причина или null',
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [contradictions, hypotheses, issues, persons, events, flows, claims] = await Promise.all([
      repositories.contradictions.list({ case_id: caseId }),
      repositories.hypotheses.list({ case_id: caseId }),
      repositories.issues.list({ case_id: caseId }),
      repositories.persons.list({ case_id: caseId }),
      repositories.events.list({ case_id: caseId }),
      repositories.moneyFlowEdges.list({ case_id: caseId }),
      repositories.claims.list({ case_id: caseId }),
    ]);
    return {
      contradictions, hypotheses, issues, persons, events, flows, claims,
      inputObjectIds: contradictions.map((c) => c.id),
    };
  },

  buildPrompt(input, gathered) {
    const personById = new Map(gathered.persons.map((p) => [p.id, p.name]));
    const claimByCode = new Map(gathered.claims.map((c) => [c.id, c]));

    return {
      caseData: {
        round: input.nextRound ?? 2,
        open_contradictions: gathered.contradictions
          .filter((x) => x.resolution_status === 'open')
          .map((x) => ({
            code: x.contradiction_code,
            type: x.type,
            severity: x.severity,
            description: x.description,
            recommended_checks: x.recommended_checks ?? [],
            said_by: [
              personById.get(claimByCode.get(x.claim_a_id)?.source_person_id) ?? null,
              personById.get(claimByCode.get(x.claim_b_id)?.source_person_id) ?? null,
            ].filter(Boolean),
          })),
        hypotheses: gathered.hypotheses
          .filter((h) => h.status !== 'eliminated')
          .map((h) => ({
            code: h.code, description: h.description, status: h.status,
            missing_evidence: h.missing_evidence ?? [],
          })),
        open_issues: gathered.issues.filter((i) => i.status === 'open').map((i) => ({
          code: i.code, question: i.question,
        })),
        participants: gathered.persons.map((p) => ({
          name: p.name, job_title: p.job_title, participant_type: p.participant_type,
        })),
        timeline: gathered.events.map((e) => ({
          code: e.event_code, description: e.description,
          start_at: e.start_at, end_at: e.end_at, time_precision: e.time_precision,
        })),
        unverified_money_flows: gathered.flows
          .filter((f) => f.verification_status === 'unverified')
          .map((f) => ({ from: f.source_entity, to: f.destination_entity, amount: f.amount })),
      },
      inputDigest: `followup:${gathered.contradictions.length}:${gathered.hypotheses.length}`,
    };
  },
});
