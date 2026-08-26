/**
 * AGENT 05 — INTERVIEW STRATEGIST (§27 ТЗ).
 *
 * Для каждого человека готовит индивидуальный план интервью.
 *
 * Порядок рассуждения жёсткий и не переставляется: сначала разбор того, что известно
 * следствию, что человек может знать, чего никто не знает и чего раскрывать нельзя, —
 * и только потом вопросы. Вопросы, придуманные до этого разбора, неизбежно раскрывают
 * человеку то, чего он знать не должен.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { InterviewPlanSchema } from '../schemas.js';
import { QUESTION_TYPE } from '../../domain/enums.js';

export const interviewStrategistAgent = defineAgent({
  id: 'interview_strategist',
  version: '1.0.0',
  promptVersion: 'interview_strategist/2026-08-1',
  title: 'Interview Strategist',
  role: `
Ты готовишь план интервью конкретного человека по методике PEACE.

Сначала заполни четыре списка:
- known_to_investigation: что следствие уже установило по материалам;
- potential_knowledge: что этот человек предположительно может знать, исходя из его роли
  и положения в событиях;
- unknown: что не известно никому и требует установления;
- information_not_to_reveal_yet: что нельзя раскрывать этому человеку на этом раунде,
  с причиной для каждого пункта.

В information_not_to_reveal_yet обязательно попадают: показания других участников,
формулировки версий, найденные противоречия и содержание документов, которых человек
не должен был видеть.

Только после этого формулируй вопросы:
- первый вопрос всегда открытый и приглашает к свободному рассказу;
- уточнения идут после свободного рассказа, а не вместо него;
- вопрос, который прямо или косвенно раскрывает содержимое information_not_to_reveal_yet,
  помечается sensitive = true с указанием причины;
- наводящих формулировок нет: вопрос не должен содержать ожидаемый ответ.

Плохо: «Вы ведь передали деньги администратору около семи?»
Хорошо: «Что произошло после того, как вы получили деньги от клиента?»
`,
  allowedEntityTypes: ['InvestigationCase', 'Person', 'Issue', 'Hypothesis', 'Claim', 'Source'],
  forbiddenActions: [
    'формулировать наводящие вопросы, содержащие ожидаемый ответ',
    'включать в вопрос содержимое information_not_to_reveal_yet без пометки sensitive',
    'начинать интервью с уточняющего или обвинительного вопроса',
    'раскрывать участнику показания других людей',
  ],
  outputSchema: InterviewPlanSchema,
  outputContract: {
    known_to_investigation: ['что следствие уже установило'],
    potential_knowledge: ['что этот человек может знать'],
    unknown: ['что не известно никому'],
    information_not_to_reveal_yet: [{ item: 'что нельзя раскрывать', reason: 'почему' }],
    objectives: ['цель этого интервью'],
    questions: [{
      question: 'формулировка',
      question_type: QUESTION_TYPE.join(' | '),
      purpose: 'что этот вопрос устанавливает',
      addresses_issue: 'код вопроса расследования или null',
      sensitive: false,
      sensitive_reason: 'причина или null',
    }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [investigationCase, person, issues, hypotheses, claims, persons] = await Promise.all([
      repositories.cases.get(caseId),
      repositories.persons.get(input.personId),
      repositories.issues.list({ case_id: caseId }),
      repositories.hypotheses.list({ case_id: caseId }),
      repositories.claims.list({ case_id: caseId }),
      repositories.persons.list({ case_id: caseId }),
    ]);
    if (!person) throw new Error(`Участник ${input.personId} не найден`);

    return {
      investigationCase,
      person,
      issues,
      hypotheses,
      claims,
      persons,
      inputObjectIds: [person.id],
    };
  },

  buildPrompt(input, gathered) {
    const own = gathered.claims.filter((c) => c.source_person_id === gathered.person.id);
    const others = gathered.claims.filter((c) => c.source_person_id !== gathered.person.id);

    return {
      caseData: {
        case: { title: gathered.investigationCase?.title, round: input.round ?? 1 },
        interviewee: {
          name: gathered.person.name,
          job_title: gathered.person.job_title,
          participant_type: gathered.person.participant_type,
          relationship_to_incident: gathered.person.relationship_to_incident,
        },
        other_participants: gathered.persons
          .filter((p) => p.id !== gathered.person.id)
          .map((p) => ({ name: p.name, job_title: p.job_title })),
        issues: gathered.issues.map((i) => ({ code: i.code, question: i.question, status: i.status })),
        hypotheses: gathered.hypotheses.map((h) => ({ code: h.code, description: h.description })),
        // Собственные показания человека даны полностью: он их и так знает.
        own_previous_claims: own.map((c) => ({
          code: c.claim_code, statement: c.normalized_statement || c.text,
        })),
        // Чужие показания даны только счётчиком: их содержимое агенту для планирования
        // не нужно, а риск утечки в формулировку вопроса реален.
        other_testimony_exists: others.length > 0,
        other_testimony_count: others.length,
      },
      inputDigest: `${gathered.person.id}:plan:${own.length}`,
    };
  },
});
