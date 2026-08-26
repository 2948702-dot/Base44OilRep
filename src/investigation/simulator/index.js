/**
 * Симулятор расследований и бенчмарк (§51–§52 ТЗ).
 *
 * По §84 это и есть то, что нельзя скопировать вместе с интерфейсом: библиотека
 * учебных дел со скрытой истиной и способ измерить, насколько расследование к ней
 * приблизилось, не подсказав ответа.
 */

export { validateTrainingCase, publicView, toEntity, TRAINING_CASE_TYPES } from './trainingCase.js';
export { createScriptedDirector, createAgentDirector, assertNoDialogueLeak, GroundTruthLeak } from './director.js';
export { runSimulation } from './runSimulation.js';
export { collectArtifacts } from './artifacts.js';
export { scoreRun, formatReport, BENCHMARK_VERSION, SAFETY_METRICS } from './benchmark.js';
export { computeMetrics } from './metrics.js';
export { matchesAll, matchesAny, namesPerson, normalize } from './text.js';
