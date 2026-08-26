/**
 * Case Director симулятора (§51 ТЗ).
 *
 * Директор — единственная сторона прогона, знающая, что произошло на самом деле.
 * Он играет участников и держателей материалов: отвечает на вопросы интервью и решает,
 * выдать ли запрошенный документ.
 *
 * Правило, ради которого этот слой существует: директор никогда не сообщает ответ.
 * Он воспроизводит поведение мира, в котором расследование ведётся, а не подсказывает
 * вывод. Нарушение проверяется кодом — список `never_reveal_in_dialogue` из ground truth
 * не может появиться ни в одной реплике директора. Прогон, где это произошло,
 * останавливается: измерять качество расследования по подсказанной истине бессмысленно.
 */

import { matchesAll, normalize } from './text.js';

export class GroundTruthLeak extends Error {
  constructor(message) {
    super(`SIMULATOR_GROUND_TRUTH_LEAK: ${message}`);
    this.name = 'GroundTruthLeak';
    this.code = 'SIMULATOR_GROUND_TRUTH_LEAK';
  }
}

/**
 * Проверяет реплику директора на прямое раскрытие скрытой истины.
 *
 * @param {string} text
 * @param {Object} groundTruth
 */
export function assertNoDialogueLeak(text, groundTruth) {
  const forbidden = groundTruth?.never_reveal_in_dialogue ?? [];
  const haystack = normalize(text);
  for (const phrase of forbidden) {
    if (haystack.includes(normalize(phrase))) {
      throw new GroundTruthLeak(`реплика раскрывает скрытую истину: «${phrase}»`);
    }
  }
  return text;
}

const NO_ANSWER = 'Мне нечего добавить по этому вопросу.';

/**
 * Директор, работающий по написанному сценарию.
 *
 * Он не использует модель. Это сделано намеренно: прогон бенчмарка должен измерять
 * качество агентов расследования, а не колебания второй модели в той же цепочке.
 * Сценарный директор даёт одинаковый мир при каждом запуске, и разница между прогонами
 * относится к тому, что мы измеряем.
 *
 * @param {Object} document учебное дело целиком, вместе с ground truth
 */
export function createScriptedDirector(document) {
  const truth = document.ground_truth ?? {};
  const scripts = truth.person_scripts ?? {};
  const sequence = document.evidence_sequence ?? [];

  return {
    mode: 'scripted',

    /**
     * Ответ участника на вопрос интервью.
     *
     * @param {Object} params
     * @param {{name: string}} params.person
     * @param {string} params.question
     */
    async answerQuestion({ person, question }) {
      const script = scripts[person?.name];
      if (!script) {
        return { text: NO_ANSWER, matched: false, scripted: false, personName: person?.name };
      }

      const answer = (script.answers ?? []).find((item) => matchesAll(question, item.markers));
      const text = answer?.text ?? script.default_answer ?? NO_ANSWER;

      return {
        text: assertNoDialogueLeak(text, truth),
        matched: Boolean(answer),
        scripted: true,
        personName: person.name,
        answerId: answer?.id ?? null,
      };
    },

    /**
     * Решение по запросу материала.
     *
     * Отказ — такой же законный исход, как выдача: расследование, где любой запрос
     * удовлетворяется, не проверяет умение работать с недоступным материалом.
     *
     * @param {Object} params
     * @param {string} params.text текст запроса, как его сформулировало расследование
     */
    async respondToRequest({ text }) {
      // Из нескольких подошедших материалов выбирается самый конкретный: «камера в
      // помещении администратора» не должна оборачиваться записью камеры у входа
      // только потому, что та стоит в перечне выше.
      const item = sequence
        .map((candidate) => ({
          candidate,
          specificity: Math.max(
            0,
            ...(candidate.request_markers ?? [])
              .filter((group) => matchesAll(text, group))
              .map((group) => group.length),
          ),
        }))
        .filter((entry) => entry.specificity > 0)
        .sort((a, b) => b.specificity - a.specificity)[0]?.candidate;

      if (!item) {
        return {
          granted: false,
          itemId: null,
          reason: assertNoDialogueLeak(
            'Материала с такими признаками в деле нет.',
            truth,
          ),
          artifact: null,
        };
      }

      if (item.available === false) {
        return {
          granted: false,
          itemId: item.id,
          reason: assertNoDialogueLeak(item.unavailable_reason, truth),
          artifact: null,
        };
      }

      return {
        granted: true,
        itemId: item.id,
        reason: null,
        artifact: {
          title: item.title,
          type: item.type ?? 'document',
          content: item.content,
          reliability: item.reliability ?? 'moderate',
          relevance: item.relevance ?? 'medium',
        },
      };
    },
  };
}

/**
 * Директор на модели: та же роль, но реплики порождает Case Director agent.
 *
 * Свобода директора ограничена жёстко. Материал он не выдумывает: агент вправе выбрать
 * элемент `evidence_sequence` и озвучить его, но не создать новый. Иначе бенчмарк
 * измерял бы изобретательность директора, а расследование получало бы доказательства,
 * которых в учебном деле нет.
 *
 * @param {Object} document
 * @param {Object} params
 * @param {Function} params.runDirectorAgent (input) => Promise<Object>
 */
export function createAgentDirector(document, { runDirectorAgent }) {
  const truth = document.ground_truth ?? {};
  const sequence = document.evidence_sequence ?? [];
  const scripted = createScriptedDirector(document);

  return {
    mode: 'agent',

    async answerQuestion({ person, question, round }) {
      const output = await runDirectorAgent({
        kind: 'interview_answer',
        personName: person?.name,
        question,
        round,
      });
      const text = output?.answer_text ?? NO_ANSWER;
      return {
        text: assertNoDialogueLeak(text, truth),
        matched: Boolean(output?.answer_text),
        scripted: false,
        personName: person?.name,
      };
    },

    async respondToRequest({ text }) {
      const output = await runDirectorAgent({ kind: 'evidence_request', request: text });

      if (!output?.granted) {
        return {
          granted: false,
          itemId: output?.item_id ?? null,
          reason: assertNoDialogueLeak(output?.refusal_reason ?? 'Материал недоступен.', truth),
          artifact: null,
        };
      }

      const item = sequence.find((candidate) => candidate.id === output.item_id);
      if (!item) {
        throw new Error(
          `SIMULATOR_DIRECTOR_INVENTED_EVIDENCE: директор выдал материал ${output.item_id ?? '(без идентификатора)'}, `
          + 'которого нет в учебном деле',
        );
      }
      if (item.available === false) {
        throw new Error(
          `SIMULATOR_DIRECTOR_INVENTED_EVIDENCE: материал ${item.id} помечен недоступным, но выдан`,
        );
      }

      // Содержимое берётся из учебного дела, а не из ответа модели: озвучивание
      // не должно превращаться в переписывание материала.
      return scripted.respondToRequest({ text: item.request_markers[0].join(' ') });
    },
  };
}
