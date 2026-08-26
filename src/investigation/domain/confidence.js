/**
 * Качественная шкала уверенности.
 *
 * Псевдоточные оценки запрещены: система не показывает «83.6% виновен» и не выводит
 * вероятность лжи (§63, §71 ТЗ). Уверенность относится к подтверждённости утверждения,
 * к оценке времени события и к выводу, но никогда — к честности человека.
 */

export const CONFIDENCE_LEVELS = ['very_low', 'low', 'moderate', 'high', 'very_high'];

const ORDER = new Map(CONFIDENCE_LEVELS.map((level, index) => [level, index]));

export const CONFIDENCE_LABELS_RU = {
  very_low: 'Очень низкая',
  low: 'Низкая',
  moderate: 'Средняя',
  high: 'Высокая',
  very_high: 'Очень высокая',
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isConfidenceLevel(value) {
  return typeof value === 'string' && ORDER.has(value);
}

/**
 * Сравнивает два уровня уверенности.
 * @param {string} a
 * @param {string} b
 * @returns {number} отрицательное, если a слабее b
 */
export function compareConfidence(a, b) {
  assertConfidence(a);
  assertConfidence(b);
  return ORDER.get(a) - ORDER.get(b);
}

/**
 * Возвращает наименьший из уровней. Используется, когда вывод опирается на цепочку
 * шагов: итоговая уверенность не может быть выше самого слабого звена.
 * @param {...string} levels
 * @returns {string}
 */
export function weakest(...levels) {
  const provided = levels.filter(Boolean);
  if (provided.length === 0) return 'very_low';
  return provided.reduce((acc, level) => (compareConfidence(level, acc) < 0 ? level : acc));
}

/**
 * @param {string} value
 */
export function assertConfidence(value) {
  if (!isConfidenceLevel(value)) {
    throw new Error(
      `Недопустимый уровень уверенности: ${String(value)}. Числовые и процентные оценки запрещены.`,
    );
  }
}

/**
 * Выводит уровень уверенности в подтверждении утверждения из состава подтверждений.
 *
 * Правило намеренно консервативно: несколько зависимых пересказов одного и того же
 * источника не дают высокой уверенности, а объективное доказательство весит больше
 * согласованных показаний.
 *
 * @param {{independentSources?: number, objectiveEvidence?: number, contradicting?: number}} input
 * @returns {string}
 */
export function corroborationConfidence(input) {
  const independent = input.independentSources ?? 0;
  const objective = input.objectiveEvidence ?? 0;
  const contradicting = input.contradicting ?? 0;

  if (contradicting > 0 && objective === 0) return 'very_low';
  if (objective >= 2 && contradicting === 0) return 'very_high';
  if (objective >= 1 && independent >= 2 && contradicting === 0) return 'high';
  if (objective >= 1 || independent >= 2) return 'moderate';
  if (independent === 1) return 'low';
  return 'very_low';
}
