/**
 * Прогон учебного дела и бенчмарк расследования (§51–§52 ТЗ).
 *
 * Запуск:
 *   node investigation/tools/benchmark.mjs                  — на stub-модели и в памяти
 *   node investigation/tools/benchmark.mjs --postgres        — то же против настоящей базы
 *   node investigation/tools/benchmark.mjs --live            — на настоящей модели
 *
 * На stub-модели прогон детерминирован и годится для непрерывной проверки: он измеряет
 * не качество формулировок модели, а то, что цепочка сервисов доводит учебное дело до
 * отчёта и что оценщик считает то, что обещает. Настоящее измерение качества агентов —
 * это `--live`, и оно стоит денег, поэтому в CI не запускается.
 *
 * Прогон считается непройденным, если нарушена хотя бы одна защитная метрика: доля
 * утверждений без опоры, ложное обвинение непричастного, преждевременное закрытие
 * версии или исключение верной версии.
 */

import { createMemoryStore, createPool, withTenant } from '../../src/investigation/repositories/index.js';
import { createInvestigationServices } from '../../src/investigation/services/index.js';
import { createStubLlmClient, createAnthropicLlmClient } from '../../src/investigation/agents/framework/llmClient.js';
import { MISSING_CASH_001_TRAINING } from '../../src/investigation/fixtures/training-cases/missingCash001.js';
import { formatReport } from '../../src/investigation/simulator/benchmark.js';
import * as stub from './fixtures/stub-outputs.mjs';

const USE_POSTGRES = process.argv.includes('--postgres');
const LIVE = process.argv.includes('--live');

/**
 * Ответы stub-модели в том порядке, в котором прогон вызывает агентов.
 * Порядок повторяет цикл расследования §67 ТЗ и проверяется самим прогоном:
 * сбившийся порядок немедленно ломает разбор ответа схемой.
 */
const LLM_RESPONSES = [
  stub.INTAKE_OUTPUT,             // 02 intake_analyst
  stub.PLAN_OUTPUT,               // 03 investigation_planner
  stub.STRATEGY_IVANOV,           // 05 interview_strategist
  stub.CLAIMS_IVANOV,             // 07 claim_extractor
  stub.STRATEGY_PETROVA,          // 05 interview_strategist
  stub.CLAIMS_PETROVA,            // 07 claim_extractor
  stub.TIMELINE_OUTPUT,           // 08 timeline_analyst
  stub.CONTRADICTIONS_OUTPUT,     // 09 contradiction_analyst
  stub.CORROBORATION_OUTPUT,      // 10 corroboration_agent
  stub.HYPOTHESIS_REVIEW_OUTPUT,  // 12 hypothesis_analyst
  stub.RED_TEAM_OUTPUT,           // 13 red_team_investigator
  stub.FOLLOW_UP_OUTPUT,          // 15 follow_up_planner
  stub.FINANCIAL_OUTPUT,          // 11 financial_investigator
  stub.FINAL_REVIEW_OUTPUT,       // 17 final_reviewer
  stub.DEFENCE_REVIEW_OUTPUT,     // 14 defence_reviewer
  stub.ROOT_CAUSE_OUTPUT,         // 16 root_cause_analyst
  stub.REPORT_OUTPUT,             // 18 report_writer
];

async function setupBackend() {
  if (!USE_POSTGRES) {
    return { store: createMemoryStore(), organizationId: 'org_sim', actorId: 'user_sim' };
  }

  const pool = createPool();
  const created = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const stamp = Date.now();
    const org = await client.query(
      "insert into organization (name, slug, status) values ($1, $2, 'active') returning id",
      [`Учебный контур ${stamp}`, `simulator-${stamp}`],
    );
    const organizationId = org.rows[0].id;
    const user = await client.query(
      "insert into app_user (organization_id, role, full_name, status) "
      + "values ($1, 'org_owner', $2, 'active') returning id",
      [organizationId, 'Владелец учебного контура'],
    );
    return { organizationId, actorId: user.rows[0].id };
  });

  return { pool, ...created };
}

async function main() {
  const backend = await setupBackend();
  const scope = {
    organizationId: backend.organizationId,
    actorId: backend.actorId,
    actorType: 'user',
  };
  const storage = backend.store
    ? { store: backend.store, driver: 'memory' }
    : { pool: backend.pool, driver: 'postgres' };

  const llm = LIVE ? createAnthropicLlmClient() : createStubLlmClient(LLM_RESPONSES);
  const services = createInvestigationServices({ scope, ...storage, llm });

  const trainingCase = await services.simulator.loadTrainingCase(MISSING_CASH_001_TRAINING);

  // Открытая половина отдаётся наружу без скрытой истины. Проверяется здесь, а не
  // только в приёмке: библиотека учебных дел бесполезна, если ответ виден рядом.
  const listed = await services.simulator.listTrainingCases();
  if (listed.some((item) => item.ground_truth)) {
    throw new Error('Список учебных дел раскрывает скрытую истину: прогон остановлен');
  }

  const result = await services.simulator.run({
    trainingCaseId: trainingCase.id,
    directorMode: LIVE ? 'agent' : 'scripted',
    onStep: (step) => {
      const mark = step.ok ? '·' : '✗';
      console.log(`${mark} ${step.name}${step.ok ? '' : `: ${step.error}`}`);
    },
  });

  console.log('');
  console.log(formatReport(result, {
    title: `Бенчмарк «${trainingCase.title}» (${result.benchmarkVersion}, `
      + `хранилище: ${backend.store ? 'память' : 'PostgreSQL'}, `
      + `директор: ${LIVE ? 'модель' : 'сценарий'})`,
  }));

  // Повторный подсчёт по сохранённому делу обязан дать тот же результат: метрика,
  // зависящая от момента подсчёта, ничего не измеряет.
  const rescored = await services.simulator.rescore(result.run.id);
  const stable = JSON.stringify(rescored.metrics) === JSON.stringify(result.metrics);
  console.log('');
  console.log(stable
    ? 'Повторный подсчёт по сохранённому делу дал тот же результат.'
    : 'ВНИМАНИЕ: повторный подсчёт разошёлся с первым.');

  if (backend.pool) await backend.pool.end();

  const failedSteps = result.failedSteps ?? [];
  if (failedSteps.length > 0) {
    console.error(`\nШаги, завершившиеся ошибкой: ${failedSteps.map((s) => s.name).join(', ')}`);
  }

  const ok = result.safetyPassed && stable && failedSteps.length === 0;
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`Прогон симулятора прерван: ${error.stack ?? error.message}`);
  process.exit(1);
});
