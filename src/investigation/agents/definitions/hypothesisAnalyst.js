/**
 * AGENT 12 — HYPOTHESIS ANALYST (§34 ТЗ).
 *
 * После поступления новых данных пересматривает все версии.
 *
 * Ключевое ограничение: альтернативная версия никогда не удаляется автоматически.
 * Ослабленная версия остаётся в деле со статусом weakened; исключить её может только
 * человек, и только когда есть доказательство, которое её действительно закрывает.
 * Именно на этом держится метрика Premature Closure (§52 ТЗ).
 */

import { defineAgent } from '../framework/defineAgent.js';
import { HypothesisAnalysisSchema } from '../schemas.js';
import { HYPOTHESIS_STATUS } from '../../domain/enums.js';

export const hypothesisAnalystAgent = defineAgent({
  id: 'hypothesis_analyst',
  version: '1.0.0',
  promptVersion: 'hypothesis_analyst/2026-08-1',
  title: 'Hypothesis Analyst',
  role: `
Ты пересматриваешь все версии расследования по текущему состоянию материалов.

Для каждой версии определи:
- какие утверждения и доказательства её поддерживают;
- какие ей противоречат;
- какие доказательства она не объясняет (unexplained_evidence) — это самый
  недооценённый пункт: версия, оставляющая факты без объяснения, слаба, даже если
  всё остальное её подтверждает;
- каких доказательств не хватает, чтобы её проверить;
- какие альтернативные объяснения тех же фактов остаются возможными.

Как назначать статус:
- active — версия проверяется, решающих данных пока нет;
- supported — есть объективные доказательства и независимое подтверждение;
- weakened — появились противоречащие данные, но версия не закрыта;
- contradicted — есть прямое противоречащее доказательство;
- unresolved — данных достаточно, но они не сходятся ни в одну сторону;
- eliminated НЕ назначать. Исключение версии — решение человека.

Уверенность выражается только качественной шкалой и относится к подтверждённости
версии материалами, а не к тому, насколько правдоподобной она кажется.

Не подгоняй остальные версии под основную: каждая оценивается по своим материалам.
`,
  allowedEntityTypes: [
    'Hypothesis', 'Claim', 'Evidence', 'ClaimEvidenceLink', 'Contradiction', 'InvestigationEvent',
  ],
  forbiddenActions: [
    'назначать версии статус eliminated',
    'удалять альтернативную версию',
    'оценивать версию исходя из выводов по другой версии',
    'выражать уверенность числом или процентом',
  ],
  outputSchema: HypothesisAnalysisSchema,
  outputContract: {
    analyses: [{
      hypothesis_code: 'H-001',
      status: HYPOTHESIS_STATUS.filter((s) => s !== 'eliminated').join(' | '),
      supporting_claim_ids: ['C-001'],
      supporting_evidence_ids: ['E-001'],
      contradicting_claim_ids: ['C-014'],
      contradicting_evidence_ids: [],
      unexplained_evidence: ['что версия не объясняет'],
      missing_evidence: ['чего не хватает для проверки'],
      alternative_explanations: ['иное объяснение тем же фактам'],
      confidence: 'very_low | low | moderate | high | very_high',
      status_change_reason: 'почему статус именно такой',
    }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [hypotheses, claims, evidence, links, contradictions, events] = await Promise.all([
      repositories.hypotheses.list({ case_id: caseId }),
      repositories.claims.list({ case_id: caseId }),
      repositories.evidence.list({ case_id: caseId }),
      repositories.claimEvidenceLinks.list({ case_id: caseId }),
      repositories.contradictions.list({ case_id: caseId }),
      repositories.events.list({ case_id: caseId }),
    ]);
    return {
      hypotheses, claims, evidence, links, contradictions, events,
      inputObjectIds: hypotheses.map((h) => h.id),
    };
  },

  buildPrompt(input, gathered) {
    return {
      caseData: {
        hypotheses: gathered.hypotheses.map((h) => ({
          code: h.code,
          description: h.description,
          type: h.type,
          current_status: h.status,
          evidence_that_would_support: h.evidence_that_would_support ?? [],
          evidence_that_would_contradict: h.evidence_that_would_contradict ?? [],
        })),
        claims: gathered.claims.map((c) => ({
          code: c.claim_code,
          statement: c.normalized_statement || c.text,
          speaker_certainty: c.speaker_certainty,
          corroboration_status: c.corroboration_status,
        })),
        evidence: gathered.evidence.map((e) => ({
          code: e.evidence_code, description: e.description, reliability: e.reliability,
        })),
        links: gathered.links.map((l) => ({
          claim_id: l.claim_id, evidence_id: l.evidence_id, relation: l.relation,
        })),
        contradictions: gathered.contradictions.map((x) => ({
          code: x.contradiction_code, type: x.type, description: x.description,
          resolution_status: x.resolution_status,
        })),
        events: gathered.events.map((e) => ({
          code: e.event_code, description: e.description,
          start_at: e.start_at, end_at: e.end_at, time_precision: e.time_precision,
        })),
      },
      inputDigest: `hypotheses:${gathered.hypotheses.length}:${gathered.claims.length}`,
    };
  },
});
