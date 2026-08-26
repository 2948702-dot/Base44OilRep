/**
 * AGENT 13 — RED TEAM INVESTIGATOR (§35 ТЗ).
 *
 * Работает независимо и пытается доказать, что основная версия ошибочна.
 *
 * Изоляция обязательна: агент получает только структурированные факты, утверждения,
 * доказательства и формулировку текущей версии. Рассуждения Hypothesis Analyst ему
 * не передаются — иначе он воспроизведёт чужую логику вместо независимой проверки.
 * Ограничение реализовано в gatherContext, а не просьбой в промпте.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { RedTeamReviewSchema } from '../schemas.js';

export const redTeamInvestigatorAgent = defineAgent({
  id: 'red_team_investigator',
  version: '1.0.0',
  promptVersion: 'red_team_investigator/2026-08-1',
  title: 'Red Team Investigator',
  role: `
Твоя задача — попытаться доказать, что основная версия расследования ошибочна.

Ты не защищаешь конкретного человека и не ищешь смягчающих обстоятельств: этим занимается
Defence Reviewer. Ты проверяешь доказательственную конструкцию на прочность.

Ищи:
- альтернативное объяснение тем же фактам;
- выборочное использование доказательств: что осталось за рамками версии;
- подтверждающее смещение: где вывод сделан потому, что ожидался;
- пропущенное доказательство и неопрошенного свидетеля;
- неверный логический переход от утверждения к выводу;
- ошибку в установлении личности, учётную и техническую ошибку.

Для каждой найденной слабости укажи, какое конкретное доказательство её сняло бы или
подтвердило. Возражение, которое ничем нельзя проверить, бесполезно.

Если основная версия действительно выдерживает проверку, скажи это прямо. Придумывать
слабости там, где их нет, так же вредно, как их не замечать.
`,
  allowedEntityTypes: ['Claim', 'Evidence', 'ClaimEvidenceLink', 'InvestigationEvent', 'Contradiction'],
  forbiddenActions: [
    'читать рассуждения и оценки Hypothesis Analyst',
    'использовать выводы других аналитических агентов как основание',
    'предлагать альтернативу без указания проверяемого доказательства',
    'делать вывод о виновности или невиновности конкретного человека',
  ],
  outputSchema: RedTeamReviewSchema,
  outputContract: {
    primary_hypothesis_reviewed: 'код версии',
    alternative_explanations: [{
      description: 'альтернативное объяснение тем же фактам',
      plausibility: 'very_low | low | moderate | high | very_high',
      would_be_supported_by: ['проверяемое доказательство'],
      currently_ruled_out_by: ['что уже исключает эту альтернативу'],
    }],
    reasoning_flaws: [{
      flaw_type: 'cherry_picking | confirmation_bias | overlooked_evidence | incorrect_inference | missing_witness | mistaken_identity | accounting_error | technical_error | unsupported_leap',
      description: 'строка',
      affected_claims: ['C-001'],
      what_would_settle_it: 'какое доказательство разрешит вопрос',
    }],
    overlooked_evidence: ['что не учтено'],
    verdict: 'primary_hypothesis_survives | primary_hypothesis_weakened | primary_hypothesis_should_not_stand',
    verdict_reason: 'строка',
    observations: ['наблюдения о материале'],
  },

  /**
   * Собирает только структурированные факты. Поля `red_team_notes`, `defence_review_notes`
   * и результаты Hypothesis Analyst намеренно не читаются.
   */
  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [hypothesis, claims, evidence, links, events, contradictions] = await Promise.all([
      repositories.hypotheses.get(input.hypothesisId),
      repositories.claims.list({ case_id: caseId }),
      repositories.evidence.list({ case_id: caseId }),
      repositories.claimEvidenceLinks.list({ case_id: caseId }),
      repositories.events.list({ case_id: caseId }),
      repositories.contradictions.list({ case_id: caseId }),
    ]);

    if (!hypothesis) throw new Error(`Гипотеза ${input.hypothesisId} не найдена`);

    return {
      hypothesisStatement: { code: hypothesis.code, description: hypothesis.description },
      claims,
      evidence,
      links,
      events,
      contradictions,
      inputObjectIds: [hypothesis.id],
    };
  },

  buildPrompt(input, gathered) {
    return {
      caseData: {
        primary_hypothesis: gathered.hypothesisStatement,
        claims: gathered.claims.map((c) => ({
          code: c.claim_code,
          statement: c.normalized_statement || c.text,
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
          claim_id: l.claim_id, evidence_id: l.evidence_id, relation: l.relation, strength: l.strength,
        })),
        events: gathered.events.map((e) => ({
          code: e.event_code,
          description: e.description,
          start_at: e.start_at,
          end_at: e.end_at,
          time_precision: e.time_precision,
          competing_versions: e.competing_versions ?? [],
        })),
        contradictions: gathered.contradictions.map((x) => ({
          code: x.contradiction_code, type: x.type, description: x.description,
          resolution_status: x.resolution_status,
        })),
      },
      inputDigest: `${gathered.hypothesisStatement.code}:${gathered.claims.length}:${gathered.evidence.length}`,
    };
  },
});
