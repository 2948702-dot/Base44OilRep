/**
 * AGENT 10 — EVIDENCE CORROBORATION (§32 ТЗ).
 *
 * Для каждого существенного утверждения определяет: сколько источников его поддерживают,
 * независимы ли они, есть ли объективное доказательство и есть ли опровергающее.
 *
 * Запрещено оценивать человека. «Свидетель достоверен на 76%» невыразимо в схеме выхода
 * и не имеет смысла: подтверждается конкретное утверждение конкретным материалом,
 * а не человек целиком.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { CorroborationSchema } from '../schemas.js';
import { CORROBORATION_STATUS, EVIDENCE_RELATION } from '../../domain/enums.js';

export const corroborationAgent = defineAgent({
  id: 'corroboration_agent',
  version: '1.0.0',
  promptVersion: 'corroboration_agent/2026-08-1',
  title: 'Evidence Corroboration Agent',
  role: `
Ты определяешь, чем подтверждается каждое утверждение дела.

Независимость источников важнее их количества. Источники НЕ независимы, если:
- один человек повторил то же самое дважды в разных интервью;
- люди узнали сведения друг от друга или из общего разговора;
- документ составлен со слов того же человека, чьё утверждение проверяется;
- запись в системе внесена самим участником эпизода.

Три пересказа одного разговора — это один источник, а не три.

Как назначать corroboration_status:
- uncorroborated — только сам говорящий;
- single_source — есть второй источник, но он зависим от первого;
- multi_source — несколько источников, независимость не установлена;
- independently_corroborated — не менее двух независимых источников либо объективное
  доказательство;
- contradicted — есть материал, прямо опровергающий утверждение.

verification_status отражает проверку объективными материалами, а не согласие людей:
согласованные показания без документа — это corroborated, но не verified.

Для каждого неподтверждённого утверждения назови, что конкретно могло бы его
подтвердить. Утверждение, которое нечем проверить в принципе, так и пометь — это
важный вывод, а не пробел в работе.

Связи claim ↔ evidence описывай явно: какое доказательство какое утверждение
поддерживает, опровергает или лишь оттеняет.
`,
  allowedEntityTypes: ['Claim', 'Evidence', 'ClaimEvidenceLink', 'Source', 'Person', 'Interview'],
  forbiddenActions: [
    'оценивать достоверность человека вместо утверждения',
    'считать независимыми источники, восходящие к одному разговору',
    'признавать утверждение проверенным на основании согласия людей без объективного материала',
    'оставлять неподтверждённое утверждение без указания того, что могло бы его подтвердить',
  ],
  outputSchema: CorroborationSchema,
  outputContract: {
    assessments: [{
      claim_code: 'C-001',
      independent_source_count: 0,
      independence_reasoning: 'почему источники независимы или зависимы',
      objective_evidence_codes: ['E-001'],
      contradicting_evidence_codes: [],
      supporting_claim_codes: ['C-007'],
      corroboration_status: CORROBORATION_STATUS.join(' | '),
      verification_status: 'unverified | partially_verified | verified | refuted',
      what_would_corroborate_it: ['конкретный материал'],
    }],
    evidence_links: [{
      claim_code: 'C-001',
      evidence_code: 'E-001',
      relation: EVIDENCE_RELATION.join(' | '),
      strength: 'weak | moderate | strong',
      explanation: 'чем именно доказательство относится к утверждению',
    }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [claims, evidence, links, persons, interviews, sources] = await Promise.all([
      repositories.claims.list({ case_id: caseId }),
      repositories.evidence.list({ case_id: caseId }),
      repositories.claimEvidenceLinks.list({ case_id: caseId }),
      repositories.persons.list({ case_id: caseId }),
      repositories.interviews.list({ case_id: caseId }),
      repositories.sources.list({ case_id: caseId }),
    ]);
    return {
      claims, evidence, links, persons, interviews, sources,
      inputObjectIds: claims.map((c) => c.id),
    };
  },

  buildPrompt(input, gathered) {
    const personById = new Map(gathered.persons.map((p) => [p.id, p.name]));
    const sourceById = new Map(gathered.sources.map((s) => [s.id, s]));

    return {
      caseData: {
        claims: gathered.claims.map((c) => {
          const source = sourceById.get(c.source_id);
          return {
            code: c.claim_code,
            statement: c.normalized_statement || c.text,
            said_by: personById.get(c.source_person_id) ?? 'источник не назван',
            claim_type: c.claim_type,
            speaker_certainty: c.speaker_certainty,
            current_status: c.corroboration_status,
            // Происхождение источника нужно, чтобы отличить самостоятельное
            // наблюдение от пересказа и от записи, внесённой самим участником.
            source_type: source?.type ?? null,
            source_is_derived: source?.is_derived ?? false,
            interview_id: c.interview_id,
          };
        }),
        evidence: gathered.evidence.map((e) => ({
          code: e.evidence_code,
          description: e.description,
          type: e.type,
          reliability: e.reliability,
          integrity: e.integrity,
        })),
        existing_links: gathered.links.map((l) => ({
          claim_id: l.claim_id, evidence_id: l.evidence_id, relation: l.relation,
        })),
        interviews: gathered.interviews.map((i) => ({
          id: i.id, person: personById.get(i.person_id), round: i.round,
        })),
      },
      inputDigest: `corroboration:${gathered.claims.length}:${gathered.evidence.length}`,
    };
  },
});
