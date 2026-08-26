/**
 * AGENT 14 — DEFENCE REVIEWER (§36 ТЗ).
 *
 * Берёт человека, в отношении которого сформированы неблагоприятные выводы, и ищет
 * слабые места доказательственной конструкции — так, как искал бы тот, кто оспаривал бы
 * эти выводы в его интересах.
 *
 * Это не сочувствие и не адвокатская позиция ради равновесия: доказательственная
 * конструкция, которую невозможно оспорить изнутри, редко выдерживает спор снаружи —
 * в трудовом споре, в суде или просто при разговоре с человеком.
 *
 * Отличие от Red Team: тот проверяет версию расследования на прочность вообще,
 * этот — конкретно то, что говорит против конкретного человека.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { DefenceReviewSchema } from '../schemas.js';

export const defenceReviewerAgent = defineAgent({
  id: 'defence_reviewer',
  version: '1.0.0',
  promptVersion: 'defence_reviewer/2026-08-1',
  title: 'Defence Reviewer',
  role: `
Ты проверяешь, насколько прочны выводы, неблагоприятные для конкретного человека.

Занимай позицию того, кто будет их оспаривать. Ищи:
- hearsay: утверждение основано на пересказе, а не на собственном наблюдении;
- отсутствие независимого подтверждения: всё сводится к одному источнику;
- наводящие вопросы: формулировка вопроса подсказала ответ;
- противоречивые документы: материалы расходятся между собой;
- разрывы: между звеньями цепочки нет доказательства, есть только правдоподобие;
- невысказанные допущения: вывод верен только при условии, которое никто не проверял;
- нарушение хронологии: последовательность не подтверждена или невозможна;
- альтернативное объяснение тем же фактам;
- неопределённость в установлении личности;
- процедурные дефекты сбора материала.

Для каждой слабости назови, что конкретно её закрыло бы. Возражение, которое нечем
проверить, бесполезно так же, как противоречие без предложенной проверки.

strongest_counterargument — самое сильное, что можно сказать против выводов одной
фразой. Если сказать нечего, так и напиши: искусственная слабость вредна не меньше,
чем пропущенная.

Ты не утверждаешь, что человек ни при чём. Ты показываешь, где конструкция держится
на допущении, а не на доказательстве.
`,
  allowedEntityTypes: ['Person', 'Claim', 'Evidence', 'ClaimEvidenceLink', 'Finding',
    'InterviewQuestion', 'Contradiction', 'InvestigationEvent'],
  forbiddenActions: [
    'утверждать невиновность человека вместо разбора прочности выводов',
    'придумывать слабости там, где конструкция обоснована',
    'называть слабость без указания того, что могло бы её закрыть',
    'оценивать личность человека вместо доказательственной конструкции',
  ],
  outputSchema: DefenceReviewSchema,
  outputContract: {
    person_reviewed: 'имя',
    adverse_findings_reviewed: ['F-001'],
    weaknesses: [{
      weakness_type: 'hearsay | no_independent_corroboration | leading_question | '
        + 'contradictory_document | evidence_gap | unstated_assumption | chronology_break | '
        + 'alternative_explanation | identification_uncertainty | procedural_defect',
      description: 'в чём слабость',
      affected_claim_codes: ['C-001'],
      affected_finding_codes: ['F-001'],
      what_would_close_it: 'что закрыло бы возражение',
      severity: 'low | medium | high | critical',
    }],
    strongest_counterargument: 'самое сильное возражение одной фразой',
    verdict: 'conclusions_hold | conclusions_require_more_evidence | conclusions_should_not_stand',
    verdict_reason: 'строка',
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const person = await repositories.persons.get(input.personId);
    if (!person) throw new Error(`Участник ${input.personId} не найден`);

    const [claims, evidence, links, findings, questions, contradictions, events] = await Promise.all([
      repositories.claims.list({ case_id: caseId }),
      repositories.evidence.list({ case_id: caseId }),
      repositories.claimEvidenceLinks.list({ case_id: caseId }),
      repositories.findings.list({ case_id: caseId }),
      repositories.questions.list({ case_id: caseId }),
      repositories.contradictions.list({ case_id: caseId }),
      repositories.events.list({ case_id: caseId }),
    ]);

    return {
      person, claims, evidence, links, findings, questions, contradictions, events,
      inputObjectIds: [person.id],
    };
  },

  buildPrompt(input, gathered) {
    const claimById = new Map(gathered.claims.map((c) => [c.id, c]));
    const evidenceById = new Map(gathered.evidence.map((e) => [e.id, e.evidence_code]));

    // Неблагоприятными считаются выводы, ссылающиеся на утверждения этого человека
    // или упоминающие его: сузить круг заранее нельзя, не рискуя пропустить главное.
    const adverse = gathered.findings.filter((f) => {
      if ((f.supporting_claim_ids ?? []).some(
        (id) => claimById.get(id)?.object_entity?.includes(gathered.person.name),
      )) return true;
      return String(f.statement ?? '').includes(gathered.person.name);
    });

    return {
      caseData: {
        person: {
          name: gathered.person.name,
          job_title: gathered.person.job_title,
          participant_type: gathered.person.participant_type,
        },
        adverse_findings: adverse.map((f) => ({
          code: f.finding_code,
          statement: f.statement,
          type: f.finding_type,
          confidence: f.confidence,
          supporting_claims: (f.supporting_claim_ids ?? [])
            .map((id) => claimById.get(id)?.claim_code).filter(Boolean),
          supporting_evidence: (f.supporting_evidence_ids ?? [])
            .map((id) => evidenceById.get(id)).filter(Boolean),
          alternative_explanations: f.alternative_explanations ?? [],
        })),
        all_findings: gathered.findings.map((f) => ({
          code: f.finding_code, statement: f.statement, type: f.finding_type,
        })),
        claims: gathered.claims.map((c) => ({
          code: c.claim_code,
          statement: c.normalized_statement || c.text,
          claim_type: c.claim_type,
          speaker_certainty: c.speaker_certainty,
          corroboration_status: c.corroboration_status,
        })),
        evidence: gathered.evidence.map((e) => ({
          code: e.evidence_code, description: e.description, reliability: e.reliability,
        })),
        // Формулировки вопросов нужны, чтобы увидеть наводящие: слабость может быть
        // не в ответе, а в том, как спросили.
        questions_asked: gathered.questions.map((q) => ({
          text: q.question, type: q.question_type,
        })),
        contradictions: gathered.contradictions.map((x) => ({
          code: x.contradiction_code, description: x.description,
          resolution_status: x.resolution_status,
        })),
        timeline: gathered.events.map((e) => ({
          code: e.event_code, description: e.description,
          start_at: e.start_at, end_at: e.end_at, time_precision: e.time_precision,
        })),
      },
      inputDigest: `defence:${gathered.person.id}:${adverse.length}`,
    };
  },
});
