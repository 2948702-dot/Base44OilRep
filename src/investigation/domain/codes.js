/**
 * Человекочитаемые коды объектов дела.
 *
 * Технический `id` непригоден для отчёта и интервью: следователь оперирует
 * кодами вида C-001, H-002, CONTR-007. Коды уникальны в пределах дела и не переиспользуются
 * после soft delete, чтобы ссылка в старом отчёте оставалась однозначной.
 */

export const CODE_PREFIX = {
  allegation: 'A',
  issue: 'I',
  hypothesis: 'H',
  claim: 'C',
  event: 'EV',
  evidence: 'E',
  contradiction: 'CONTR',
  finding: 'F',
  transaction: 'TX',
  task: 'T',
};

const PADDING = { CONTR: 3, EV: 3, TX: 3, default: 3 };

/**
 * @param {keyof typeof CODE_PREFIX} kind
 * @param {number} sequence
 * @returns {string}
 */
export function formatCode(kind, sequence) {
  const prefix = CODE_PREFIX[kind];
  if (!prefix) throw new Error(`Неизвестный тип кода: ${String(kind)}`);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Порядковый номер кода должен быть натуральным числом, получено: ${sequence}`);
  }
  const width = PADDING[prefix] ?? PADDING.default;
  return `${prefix}-${String(sequence).padStart(width, '0')}`;
}

/**
 * @param {string} code
 * @returns {{prefix: string, sequence: number} | null}
 */
export function parseCode(code) {
  const match = /^([A-Z]+)-(\d+)$/.exec(String(code ?? ''));
  if (!match) return null;
  return { prefix: match[1], sequence: Number(match[2]) };
}

/**
 * Возвращает следующий код по уже существующим. Не переиспользует освободившиеся номера.
 *
 * @param {keyof typeof CODE_PREFIX} kind
 * @param {string[]} existingCodes все коды этого типа в деле, включая удалённые
 * @returns {string}
 */
export function nextCode(kind, existingCodes = []) {
  const prefix = CODE_PREFIX[kind];
  let max = 0;
  for (const code of existingCodes) {
    const parsed = parseCode(code);
    if (parsed && parsed.prefix === prefix && parsed.sequence > max) {
      max = parsed.sequence;
    }
  }
  return formatCode(kind, max + 1);
}

/**
 * Номер дела вида CASE-2026-0007. Год берётся из даты создания дела, а не из текущей,
 * чтобы перенумерация не зависела от момента чтения.
 *
 * @param {number} year
 * @param {number} sequence
 * @returns {string}
 */
export function formatCaseNumber(year, sequence) {
  return `CASE-${year}-${String(sequence).padStart(4, '0')}`;
}
