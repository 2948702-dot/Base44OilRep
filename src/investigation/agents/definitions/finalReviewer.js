/**
 * AGENT 17 — FINAL INVESTIGATION REVIEWER (§39 ТЗ).
 *
 * Разбирает материалы дела и классифицирует каждое утверждение будущего отчёта.
 *
 * Новых фактов не добавляет: он не расследует, а раскладывает уже собранное по степени
 * обоснованности. Утверждение, помеченное FACT, обязано иметь ссылку на доказательство —
 * это проверяется инвариантом при записи, а не остаётся на добросовестность модели.
 *
 * Именно этот агент отвечает за главное обещание продукта: читатель отчёта видит,
 * что установлено, что заявлено, что выведено и что осталось неизвестным.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { FinalReviewSchema } from '../schemas.js';
import { FINDING_TYPE } from '../../domain/enums.js';

export const finalReviewerAgent = defineAgent({
  id: 'final_reviewer',
  version: '1.0.0',
  promptVersion: 'final_reviewer/2026-08-1',
  title: 'Final Investigation Reviewer',
  role: `
Ты готовишь основу итогового отчёта: раскладываешь собранный материал по степени
обоснованности. Расследование ты не ведёшь и новых сведений не привносишь.

Классификация:
- fact — установлено объективным доказательством. Обязательна ссылка на доказательство.
  Согласие двух людей фактом не является: это corroborated_claim.
- corroborated_claim — утверждение, подтверждённое независимым источником, но без
  объективного доказательства.
- inference — вывод, следующий из материалов, но не зафиксированный напрямую.
  Логический переход должен быть назван в classification_reason.
- unresolved — вопрос, по которому данные есть, но они не сходятся.
- procedural_failure — нарушение порядка или контроля, установленное материалами.
- root_cause — причина, по которой событие стало возможным.

Жёсткие правила:
- Ни одно утверждение не описывает человека как виновного. Описывается действие и его
  обоснованность, а не оценка личности.
- Отсутствие доказательства не превращается в доказательство отсутствия: если передача
  денег не подтверждена, это не значит, что её не было.
- Приблизительные величины остаются приблизительными.
- Каждая неразрешённая линия попадает в unresolved_questions с указанием того,
  что могло бы её закрыть. Умолчание о неразрешённом — худшая ошибка отчёта.
- report_readiness = not_ready, если осталось открытым критическое противоречие или
  ключевой вывод держится на единственном непроверенном источнике.
`,
  allowedEntityTypes: [
    'Claim', 'Evidence', 'ClaimEvidenceLink', 'Contradiction', 'Hypothesis',
    'InvestigationEvent', 'Issue', 'Person',
  ],
  forbiddenActions: [
    'добавлять сведения, отсутствующие в материалах дела',
    'помечать как fact утверждение без ссылки на доказательство',
    'превращать отсутствие доказательства в доказательство отсутствия',
    'описывать человека как виновного',
    'умалчивать о неразрешённых вопросах ради связности отчёта',
  ],
  outputSchema: FinalReviewSchema,
  outputContract: {
    findings: [{
      statement: 'формулировка вывода',
      finding_type: FINDING_TYPE.join(' | '),
      confidence: 'very_low | low | moderate | high | very_high',
      supporting_claim_codes: ['C-001'],
      supporting_evidence_codes: ['E-001'],
      contradicting_evidence_codes: [],
      alternative_explanations: ['иное объяснение'],
      issue_codes: ['I-001'],
      hypothesis_codes: ['H-002'],
      classification_reason: 'почему именно этот тип и уровень уверенности',
    }],
    unresolved_questions: [{
      question: 'что осталось неизвестным',
      why_unresolved: 'почему',
      what_would_resolve_it: 'что закрыло бы вопрос',
    }],
    report_readiness: 'ready | ready_with_reservations | not_ready',
    readiness_reason: 'строка',
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [investigationCase, claims, evidence, links, contradictions, hypotheses, events, issues, persons] =
      await Promise.all([
        repositories.cases.get(caseId),
        repositories.claims.list({ case_id: caseId }),
        repositories.evidence.list({ case_id: caseId }),
        repositories.claimEvidenceLinks.list({ case_id: caseId }),
        repositories.contradictions.list({ case_id: caseId }),
        repositories.hypotheses.list({ case_id: caseId }),
        repositories.events.list({ case_id: caseId }),
        repositories.issues.list({ case_id: caseId }),
        repositories.persons.list({ case_id: caseId }),
      ]);

    return {
      investigationCase, claims, evidence, links, contradictions, hypotheses, events, issues, persons,
      inputObjectIds: [caseId],
    };
  },

  buildPrompt(input, gathered) {
    const personById = new Map(gathered.persons.map((p) => [p.id, p.name]));
    const evidenceById = new Map(gathered.evidence.map((e) => [e.id, e.evidence_code]));
    const claimById = new Map(gathered.claims.map((c) => [c.id, c.claim_code]));

    return {
      caseData: {
        case: {
          title: gathered.investigationCase?.title,
          case_type: gathered.investigationCase?.case_type,
          estimated_loss: gathered.investigationCase?.estimated_loss,
          currency: gathered.investigationCase?.currency,
        },
        issues: gathered.issues.map((i) => ({ code: i.code, question: i.question, status: i.status })),
        claims: gathered.claims.map((c) => ({
          code: c.claim_code,
          statement: c.normalized_statement || c.text,
          said_by: personById.get(c.source_person_id) ?? 'источник не назван',
          claim_type: c.claim_type,
          speaker_certainty: c.speaker_certainty,
          corroboration_status: c.corroboration_status,
          time_start: c.time_start,
          time_end: c.time_end,
          time_precision: c.time_precision,
          amount: c.amount,
          currency: c.currency,
        })),
        evidence: gathered.evidence.map((e) => ({
          code: e.evidence_code,
          description: e.description,
          reliability: e.reliability,
          integrity: e.integrity,
        })),
        claim_evidence_links: gathered.links.map((l) => ({
          claim: claimById.get(l.claim_id),
          evidence: evidenceById.get(l.evidence_id),
          relation: l.relation,
          strength: l.strength,
        })),
        contradictions: gathered.contradictions.map((x) => ({
          code: x.contradiction_code,
          type: x.type,
          severity: x.severity,
          description: x.description,
          resolution_status: x.resolution_status,
        })),
        hypotheses: gathered.hypotheses.map((h) => ({
          code: h.code,
          description: h.description,
          type: h.type,
          status: h.status,
          confidence: h.confidence,
          missing_evidence: h.missing_evidence ?? [],
        })),
        timeline: gathered.events.map((e) => ({
          code: e.event_code,
          description: e.description,
          start_at: e.start_at,
          end_at: e.end_at,
          time_precision: e.time_precision,
          competing_versions: (e.competing_versions ?? []).length,
        })),
      },
      inputDigest: `final:${gathered.claims.length}:${gathered.evidence.length}:${gathered.hypotheses.length}`,
    };
  },
});
