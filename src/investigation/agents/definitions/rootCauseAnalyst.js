/**
 * AGENT 16 — ROOT CAUSE ANALYST (§38 ТЗ).
 *
 * Отвечает не «кто виноват», а «почему система позволила событию произойти».
 *
 * Разница не риторическая. Расследование, закончившееся именем виновного, оставляет
 * порядок работы прежним, и через полгода событие повторяется с другим человеком.
 * Поэтому меры здесь относятся к контролю и процедурам, а не к наказанию.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { RootCauseSchema } from '../schemas.js';

export const rootCauseAnalystAgent = defineAgent({
  id: 'root_cause_analyst',
  version: '1.0.0',
  promptVersion: 'root_cause_analyst/2026-08-1',
  title: 'Root Cause Analyst',
  role: `
Ты разбираешь, почему организация допустила это событие.

Разложи по уровням:
- immediate_cause: что непосредственно привело к событию;
- contributing_factors: обстоятельства, сделавшие его возможным или незамеченным;
- control_failures: какой контроль должен был сработать, как он должен был работать,
  как сработал на самом деле и почему;
- root_causes: причины, устранение которых делает повторение маловероятным.

Для каждой корневой причины приведи цепочку рассуждения — шаги от события к причине.
Цепочка, которая обрывается на «сотрудник поступил неправильно», не доведена до конца:
следующий вопрос — почему порядок работы позволил ему так поступить и почему это
не было замечено.

Меры:
- corrective_actions устраняют уже случившееся и его последствия;
- preventive_actions снижают вероятность повторения.

Меры относятся к порядку работы, контролю, учёту и обучению. Увольнение, взыскание
и «усилить контроль» без описания механизма мерами не являются: первое не чинит
процесс, второе не поддаётся проверке.

Если материалов не хватает, чтобы назвать корневую причину, скажи это прямо и укажи
низкую уверенность. Правдоподобная причина, названная без оснований, хуже её отсутствия:
организация начнёт чинить не то.
`,
  allowedEntityTypes: ['Finding', 'InvestigationEvent', 'Contradiction', 'Claim', 'Issue', 'Person'],
  forbiddenActions: [
    'называть корневой причиной поведение конкретного человека без разбора порядка работы',
    'предлагать увольнение, взыскание или иные кадровые меры',
    'предлагать меры без описания проверяемого механизма',
    'называть корневую причину при недостатке материалов без пометки низкой уверенности',
  ],
  outputSchema: RootCauseSchema,
  outputContract: {
    immediate_cause: 'что непосредственно привело к событию',
    contributing_factors: [{ factor: 'обстоятельство', evidence_basis: 'на чём основано' }],
    control_failures: [{
      control: 'какой контроль',
      expected_behaviour: 'как должен был работать',
      actual_behaviour: 'как сработал',
      why_it_failed: 'почему',
    }],
    root_causes: [{
      cause: 'корневая причина',
      reasoning_chain: ['шаг рассуждения от события к причине'],
      confidence: 'very_low | low | moderate | high | very_high',
    }],
    corrective_actions: [{
      action: 'мера',
      addresses: 'что устраняет',
      owner_role: 'чья это зона ответственности',
      priority: 'low | medium | high | critical',
    }],
    preventive_actions: [{ action: 'мера', prevents: 'что предотвращает', priority: 'low | medium | high | critical' }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [investigationCase, findings, events, contradictions, claims, issues, persons] =
      await Promise.all([
        repositories.cases.get(caseId),
        repositories.findings.list({ case_id: caseId }),
        repositories.events.list({ case_id: caseId }),
        repositories.contradictions.list({ case_id: caseId }),
        repositories.claims.list({ case_id: caseId }),
        repositories.issues.list({ case_id: caseId }),
        repositories.persons.list({ case_id: caseId }),
      ]);

    return {
      investigationCase, findings, events, contradictions, claims, issues, persons,
      inputObjectIds: [caseId],
    };
  },

  buildPrompt(input, gathered) {
    return {
      caseData: {
        case: {
          title: gathered.investigationCase?.title,
          case_type: gathered.investigationCase?.case_type,
          estimated_loss: gathered.investigationCase?.estimated_loss,
          currency: gathered.investigationCase?.currency,
        },
        findings: gathered.findings.map((f) => ({
          code: f.finding_code,
          statement: f.statement,
          type: f.finding_type,
          confidence: f.confidence,
          review_status: f.review_status,
        })),
        // Роли участников нужны, чтобы понять, какой контроль кому принадлежал,
        // а не чтобы назначить ответственного за событие.
        roles: gathered.persons.map((p) => ({
          job_title: p.job_title,
          participant_type: p.participant_type,
          relationship_to_incident: p.relationship_to_incident,
        })),
        timeline: gathered.events.map((e) => ({
          code: e.event_code, description: e.description,
          start_at: e.start_at, time_precision: e.time_precision,
        })),
        open_contradictions: gathered.contradictions
          .filter((x) => x.resolution_status === 'open')
          .map((x) => ({ code: x.contradiction_code, description: x.description })),
        procedural_claims: gathered.claims
          .filter((c) => ['state', 'knowledge', 'observation'].includes(c.claim_type))
          .map((c) => ({ code: c.claim_code, statement: c.normalized_statement || c.text })),
        issues: gathered.issues.map((i) => ({ code: i.code, question: i.question, status: i.status })),
      },
      inputDigest: `rootcause:${gathered.findings.length}:${gathered.events.length}`,
    };
  },
});
