/**
 * AGENT 07 — CLAIM EXTRACTOR (§29 ТЗ).
 *
 * Превращает ответ участника в атомарные утверждения. Каждое утверждение обязано
 * ссылаться на источник и позицию в нём: без ссылки утверждение нельзя проверить,
 * а отчёт нельзя защитить.
 *
 * Пример разбора фразы «Около семи я приехал на базу и передал Лене примерно 74 тысячи»:
 *   C-001 Иванов прибыл на базу
 *   C-002 время прибытия приблизительно 19:00
 *   C-003 Иванов утверждает, что передал деньги Елене
 *   C-004 по словам Иванова, сумма составляла приблизительно 74 000 ₽
 */

import { defineAgent } from '../framework/defineAgent.js';
import { ClaimExtractionSchema } from '../schemas.js';
import { SPEAKER_CERTAINTY, CLAIM_TYPE } from '../../domain/enums.js';

export const claimExtractorAgent = defineAgent({
  id: 'claim_extractor',
  version: '1.0.0',
  promptVersion: 'claim_extractor/2026-08-1',
  title: 'Claim Extractor',
  role: `
Ты разбираешь ответ человека на минимальные самостоятельные утверждения.

Правила:
- Одно утверждение — один проверяемый факт. Составное предложение даёт несколько claims.
- Модальность сохраняется точно. «Кажется», «около», «примерно», «вроде» дают
  speaker_certainty "approximate" или "uncertain", но никогда "certain".
- Пересказ чужих слов — claim_type "hearsay", а первоисточник указывается в object_entity.
- Отрицание — это утверждение: «я не получала деньги» даёт claim_type "denial".
- Время: «около семи» — интервал с precision "hour", а не точная отметка.
- Каждое утверждение содержит source_locator с позицией в исходном тексте
  (char_start и char_end) или с меткой времени аудио.
- Оценки и мнения помечаются claim_type "opinion" и не смешиваются с наблюдениями.
- Ничего не добавляй от себя. Если местоимение непонятно, кого обозначает, запиши
  утверждение как есть и добавь запись в unresolved_references.
`,
  allowedEntityTypes: ['InterviewAnswer', 'InterviewQuestion', 'Person', 'Source'],
  forbiddenActions: [
    'усиливать модальность утверждения',
    'объединять несколько фактов в одно утверждение',
    'создавать утверждение без source_locator',
    'делать вывод о правдивости говорящего',
  ],
  outputSchema: ClaimExtractionSchema,
  outputContract: {
    claims: [{
      text: 'дословный фрагмент',
      normalized_statement: 'нормализованная формулировка',
      claim_type: `один из: ${CLAIM_TYPE.join(' | ')}`,
      subject_entity: 'кто или null',
      predicate: 'действие или null',
      object_entity: 'над чем или кем, либо null',
      time_start: 'ISO 8601 или null',
      time_end: 'ISO 8601 или null',
      time_precision: 'exact | minute | hour | part_of_day | day | week | month | range | unknown',
      amount: 'число или null',
      currency: 'строка или null',
      location: 'строка или null',
      speaker_certainty: SPEAKER_CERTAINTY.join(' | '),
      ai_extraction_confidence: 'very_low | low | moderate | high | very_high',
      source_locator: { char_start: 0, char_end: 0, timestamp: 'null или метка аудио' },
    }],
    unresolved_references: ['неоднозначные упоминания'],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories } = context;
    const answer = await repositories.answers.get(input.answerId);
    if (!answer) throw new Error(`Ответ ${input.answerId} не найден`);
    const [question, person] = await Promise.all([
      repositories.questions.get(answer.question_id),
      answer.person_id ? repositories.persons.get(answer.person_id) : Promise.resolve(null),
    ]);
    return { answer, question, person, inputObjectIds: [answer.id] };
  },

  buildPrompt(input, gathered) {
    const answerText = gathered.answer.transcript || gathered.answer.text || '';
    return {
      caseData: {
        speaker: gathered.person
          ? { name: gathered.person.name, job_title: gathered.person.job_title }
          : null,
        question: gathered.question
          ? { text: gathered.question.question, type: gathered.question.question_type }
          : null,
        answer_id: gathered.answer.id,
        transcript_confirmed: gathered.answer.transcript_confirmed ?? false,
      },
      documents: [{ label: `ANSWER ${gathered.answer.id}`, content: answerText }],
      inputDigest: `${gathered.answer.id}:${answerText.length}`,
    };
  },
});
