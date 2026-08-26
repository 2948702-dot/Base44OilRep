/**
 * Работа с приблизительным временем.
 *
 * Главное правило: «около семи» никогда не превращается в 19:00:00 (§10, §81 ТЗ).
 * Приблизительное время хранится интервалом плюс уровень точности; сужение интервала
 * допустимо только при появлении источника, а не при пересказе.
 */

export const TIME_PRECISION_WIDTH_MS = {
  exact: 0,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  part_of_day: 6 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  range: null,
  unknown: null,
};

/**
 * Строит временной интервал утверждения.
 *
 * @param {{ start?: string|null, end?: string|null, precision: string }} input
 * @returns {{ time_start: string|null, time_end: string|null, time_precision: string }}
 */
export function buildInterval(input) {
  const precision = input.precision ?? 'unknown';
  const start = input.start ?? null;
  const end = input.end ?? null;

  if (!start && !end) {
    return { time_start: null, time_end: null, time_precision: 'unknown' };
  }

  if (start && end) {
    return { time_start: start, time_end: end, time_precision: precision };
  }

  const anchor = start ?? end;
  const width = TIME_PRECISION_WIDTH_MS[precision];

  if (width === null || width === undefined) {
    return { time_start: anchor, time_end: anchor, time_precision: precision };
  }

  const anchorMs = Date.parse(anchor);
  if (Number.isNaN(anchorMs)) {
    return { time_start: null, time_end: null, time_precision: 'unknown' };
  }

  return {
    time_start: new Date(anchorMs - width / 2).toISOString(),
    time_end: new Date(anchorMs + width / 2).toISOString(),
    time_precision: precision,
  };
}

/**
 * @param {{time_start?: string|null, time_end?: string|null}} a
 * @param {{time_start?: string|null, time_end?: string|null}} b
 * @returns {boolean}
 */
export function intervalsOverlap(a, b) {
  const aStart = Date.parse(a.time_start ?? '');
  const aEnd = Date.parse(a.time_end ?? a.time_start ?? '');
  const bStart = Date.parse(b.time_start ?? '');
  const bEnd = Date.parse(b.time_end ?? b.time_start ?? '');
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Два интервала считаются несовместимыми, если они не пересекаются даже с учётом
 * заявленной неточности. Только такое расхождение имеет смысл показывать как
 * временное противоречие.
 *
 * @param {{time_start?: string|null, time_end?: string|null}} a
 * @param {{time_start?: string|null, time_end?: string|null}} b
 * @returns {boolean}
 */
export function intervalsConflict(a, b) {
  const known = [a.time_start ?? a.time_end, b.time_start ?? b.time_end];
  if (known.some((value) => !value)) return false;
  return !intervalsOverlap(a, b);
}

/**
 * Человеческое описание интервала для UI и отчёта. Никогда не показывает
 * приблизительное время как точное.
 *
 * @param {{time_start?: string|null, time_end?: string|null, time_precision?: string}} interval
 * @returns {string}
 */
export function describeInterval(interval) {
  if (!interval.time_start && !interval.time_end) return 'время неизвестно';
  if (interval.time_precision === 'exact') return String(interval.time_start);
  if (interval.time_start && interval.time_end && interval.time_start !== interval.time_end) {
    return `между ${interval.time_start} и ${interval.time_end}`;
  }
  return `приблизительно ${interval.time_start ?? interval.time_end}`;
}
