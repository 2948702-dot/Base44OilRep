/**
 * AGENT 19 — CASE DIRECTOR (§51 ТЗ).
 *
 * Работает только в симуляторе. Это единственный агент, которому известна скрытая
 * истина учебного дела, и единственный, кому разрешено читать TrainingCase.
 *
 * Его задача — вести себя как мир, в котором идёт расследование: отвечать за участников
 * так, как отвечали бы они, и решать, доступен ли запрошенный материал. Его задача —
 * не помогать расследованию и не мешать ему. Директор, подсказывающий ответ, обесценивает
 * измерение целиком: бенчмарк начинает мерить подсказку.
 *
 * Ограничения не оставлены на добросовестность промпта. Схема ответа не содержит поля,
 * куда можно записать вывод о виновности; содержимое материала берётся из учебного дела
 * по идентификатору, а не из ответа модели; запрещённые к раскрытию фразы проверяются
 * кодом после каждого ответа (см. simulator/director.js).
 */

import { defineAgent } from '../framework/defineAgent.js';
import { CaseDirectorResponseSchema } from '../schemas.js';

export const caseDirectorAgent = defineAgent({
  id: 'case_director',
  version: '1.0.0',
  promptVersion: 'case_director/2026-08-1',
  title: 'Case Director',
  role: `
Ты ведёшь учебное дело в симуляторе расследования. Тебе известно, что произошло
на самом деле. Расследованию это неизвестно, и узнать это оно должно само.

Ты играешь две роли.

Первая: участник, которому задали вопрос. Отвечай так, как ответил бы этот человек,
с его знанием, его интересом и его манерой. Человек, который не знает чего-то,
не знает этого и в ответе. Человек, которому невыгодно говорить, уходит от ответа,
а не признаётся. Человек, говорящий правду, говорит её неровно и с оговорками.

Вторая: держатель материала, у которого его запросили. Материал выдаётся, если он
существует в учебном деле и доступен. Если материала нет или он недоступен, ты
отказываешь и называешь причину — так же, как это происходит в жизни.

Чего ты не делаешь никогда:
- не сообщаешь, кто виноват, и не намекаешь на это;
- не оцениваешь работу расследования и не подсказываешь следующий шаг;
- не выдаёшь материал, которого нет в перечне учебного дела;
- не пересказываешь содержимое материала своими словами — ты называешь его
  идентификатор, содержимое возьмут из учебного дела.

Если вопрос задан участнику, которого ты не играешь, или касается того, чего он
знать не может, скажи это прямо от его лица.
`,
  allowedEntityTypes: ['TrainingCase'],
  forbiddenActions: [
    'сообщать или подсказывать расследованию скрытую истину учебного дела',
    'называть виновного',
    'выдавать материал, отсутствующий в evidence_sequence учебного дела',
    'оценивать работу расследования и предлагать следующий шаг',
    'изменять содержимое материала учебного дела',
  ],
  outputSchema: CaseDirectorResponseSchema,
  outputContract: {
    kind: 'interview_answer | evidence_response',
    answer_text: 'реплика участника, если kind = interview_answer',
    in_character_note: 'чем продиктован ответ участника: что он знает, что скрывает',
    granted: 'true | false, если kind = evidence_response',
    item_id: 'идентификатор материала из evidence_sequence',
    refusal_reason: 'почему материал не выдан',
    observations: ['наблюдения о запросе'],
  },

  /**
   * Читает учебное дело целиком, вместе со скрытой истиной. Это единственное место
   * платформы, где ground_truth попадает в контекст агента.
   */
  async gatherContext(input, context) {
    const trainingCase = await context.repositories.trainingCases.get(input.trainingCaseId);
    if (!trainingCase) throw new Error(`Учебное дело ${input.trainingCaseId} не найдено`);

    return { trainingCase, inputObjectIds: [trainingCase.id] };
  },

  buildPrompt(input, gathered) {
    const training = gathered.trainingCase;
    const truth = training.ground_truth ?? {};
    const script = input.kind === 'interview_answer'
      ? (truth.person_scripts ?? {})[input.personName] ?? null
      : null;

    return {
      caseData: {
        request_kind: input.kind,
        scenario: training.scenario,
        what_happened: truth.what_happened,
        persons: training.persons ?? [],
        person_in_role: input.personName ?? null,
        person_script: script,
        question: input.question ?? null,
        evidence_request: input.request ?? null,
        // Перечень материалов даётся без содержимого: директор выбирает элемент,
        // а содержимое подставит симулятор из самого учебного дела.
        available_materials: (training.evidence_sequence ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          available: item.available !== false,
          unavailable_reason: item.unavailable_reason ?? null,
        })),
        never_reveal_in_dialogue: truth.never_reveal_in_dialogue ?? [],
      },
      inputDigest: `${input.kind}:${input.personName ?? ''}:${(input.question ?? input.request ?? '').slice(0, 60)}`,
    };
  },
});
