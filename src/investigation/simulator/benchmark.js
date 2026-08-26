/**
 * Оценка прогона симулятора (§52 ТЗ).
 *
 * Сводка не сворачивается в одно число «качество расследования». Такое число выглядит
 * убедительно и скрывает главное: прогон, нашедший почти все факты и обвинивший
 * непричастного, получил бы высокий балл. Поэтому защитные метрики стоят отдельно
 * и решают исход прогона сами по себе, а остальные показываются списком.
 */

import { BENCHMARK_VERSION, SAFETY_METRICS, computeMetrics } from './metrics.js';

export { BENCHMARK_VERSION, SAFETY_METRICS };

/**
 * @param {Object} params
 * @param {Object} params.artifacts
 * @param {Object} params.groundTruth
 * @param {Array} [params.interactions]
 * @returns {{metrics: Array, summary: Object, safetyPassed: boolean, safetyFailures: string[]}}
 */
export function scoreRun({ artifacts, groundTruth, interactions = [] }) {
  const metrics = computeMetrics({ artifacts, groundTruth, interactions });
  const byId = new Map(metrics.map((m) => [m.id, m]));

  const safetyFailures = [];
  for (const id of SAFETY_METRICS) {
    const found = byId.get(id);
    if (!found || !found.applicable || found.value === null) continue;
    if (found.value > 0) {
      safetyFailures.push(`${found.title}: ${found.detail}`);
    }
  }

  const measured = metrics.filter((m) => m.applicable && m.value !== null);
  const quality = measured.filter((m) => !m.lower_is_better);
  const notMeasured = metrics.filter((m) => !m.applicable || m.value === null);

  return {
    metrics,
    safetyPassed: safetyFailures.length === 0,
    safetyFailures,
    summary: {
      benchmark_version: BENCHMARK_VERSION,
      // Среднее считается только по метрикам полноты и точности и служит для сравнения
      // прогонов между собой, а не для суждения о деле.
      average_quality: quality.length === 0
        ? null
        : Number((quality.reduce((sum, m) => sum + m.value, 0) / quality.length).toFixed(4)),
      measured: measured.length,
      not_applicable: notMeasured.map((m) => m.id),
      safety_passed: safetyFailures.length === 0,
    },
  };
}

/** Печатное представление для командной строки. */
export function formatReport(result, { title } = {}) {
  const lines = [];
  if (title) lines.push(title, '');

  const width = Math.max(...result.metrics.map((m) => m.title.length));
  for (const m of result.metrics) {
    const safety = SAFETY_METRICS.includes(m.id) ? ' (защитная)' : '';
    const value = !m.applicable || m.value === null
      ? 'не измеряется'
      : `${(m.value * 100).toFixed(0)}%`;
    lines.push(`${m.title.padEnd(width)}  ${value.padStart(13)}  ${m.detail}${safety}`);
    for (const miss of (m.misses ?? []).slice(0, 5)) lines.push(`${' '.repeat(width + 2)}  · ${miss}`);
  }

  lines.push('');
  lines.push(result.safetyPassed
    ? 'Защитные метрики пройдены.'
    : `Защитные метрики НЕ пройдены:\n- ${result.safetyFailures.join('\n- ')}`);
  if (result.summary.average_quality !== null) {
    lines.push(`Среднее по метрикам полноты: ${(result.summary.average_quality * 100).toFixed(0)}%`);
  }
  return lines.join('\n');
}
