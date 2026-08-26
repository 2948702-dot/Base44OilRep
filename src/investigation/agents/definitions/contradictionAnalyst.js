/**
 * AGENT 09 — CONTRADICTION ANALYST (§31 ТЗ).
 *
 * Сравнивает утверждения и находит расхождения.
 *
 * Для каждого противоречия обязан назвать, какое доказательство могло бы его разрешить.
 * Противоречие без предложенной проверки не двигает расследование, а лишь фиксирует
 * несогласие двух людей — это не результат работы следствия.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { ContradictionScanSchema } from '../schemas.js';
import { CONTRADICTION_TYPE } from '../../domain/enums.js';

export const contradictionAnalystAgent = defineAgent({
  id: 'contradiction_analyst',
  version: '1.0.0',
  promptVersion: 'contradiction_analyst/2026-08-1',
  title: 'Contradiction Analyst',
  role: `
Ты сравниваешь утверждения дела и находишь противоречия.

Типы, которые нужно различать:
- direct: одно утверждение прямо отрицает другое;
- temporal: несовместимые времена;
- financial: несовпадающие суммы, направления или назначения платежей;
- location: человек или предмет одновременно в разных местах;
- identity: расхождение в том, кто именно участвовал;
- sequence: несовместимый порядок событий;
- documentary: показание расходится с документом;
- partial: расхождение в детали при совпадении сути.

Чего противоречием НЕ считать:
- разную степень подробности: «передал деньги» и «передал деньги около семи в конверте» —
  это не противоречие;
- расхождение внутри заявленной неточности: «около семи» и «в 19:20» совместимы;
- разные формулировки одного и того же;
- отсутствие упоминания: если человек о чём-то не сказал, он этого не отрицал.

severity назначай по влиянию на исход дела, а не по эмоциональности расхождения.
Критическое противоречие — то, от разрешения которого зависит основная версия.

Для каждого противоречия обязательно предложи конкретные проверки: какие записи,
документы или свидетельства способны его разрешить.
`,
  allowedEntityTypes: ['Claim', 'Evidence', 'ClaimEvidenceLink', 'Contradiction', 'Person'],
  forbiddenActions: [
    'называть противоречием разную степень подробности изложения',
    'считать противоречием расхождение внутри заявленной неточности',
    'фиксировать противоречие без предложенной проверки',
    'делать вывод о том, кто из говорящих не прав',
  ],
  outputSchema: ContradictionScanSchema,
  outputContract: {
    contradictions: [{
      claim_a_code: 'C-001',
      claim_b_code: 'C-014',
      type: CONTRADICTION_TYPE.join(' | '),
      severity: 'low | medium | high | critical',
      description: 'в чём именно расхождение',
      recommended_checks: ['конкретная проверка, способная разрешить'],
    }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [claims, persons, existing, evidence] = await Promise.all([
      repositories.claims.list({ case_id: caseId }),
      repositories.persons.list({ case_id: caseId }),
      repositories.contradictions.list({ case_id: caseId }),
      repositories.evidence.list({ case_id: caseId }),
    ]);
    return { claims, persons, existing, evidence, inputObjectIds: claims.map((c) => c.id) };
  },

  buildPrompt(input, gathered) {
    const personById = new Map(gathered.persons.map((p) => [p.id, p.name]));
    return {
      caseData: {
        claims: gathered.claims.map((c) => ({
          code: c.claim_code,
          statement: c.normalized_statement || c.text,
          said_by: personById.get(c.source_person_id) ?? 'источник не назван',
          claim_type: c.claim_type,
          speaker_certainty: c.speaker_certainty,
          time_start: c.time_start,
          time_end: c.time_end,
          time_precision: c.time_precision,
          amount: c.amount,
          currency: c.currency,
          location: c.location,
        })),
        evidence: gathered.evidence.map((e) => ({
          code: e.evidence_code, description: e.description, reliability: e.reliability,
        })),
        // Уже зафиксированные противоречия передаются, чтобы агент не создавал дубли.
        already_recorded: gathered.existing.map((x) => ({
          claim_a: x.claim_a_id, claim_b: x.claim_b_id, type: x.type,
        })),
      },
      inputDigest: `contradictions:${gathered.claims.length}`,
    };
  },
});
