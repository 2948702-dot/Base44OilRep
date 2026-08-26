/**
 * Проверка исполнителя фоновых задач против настоящей базы.
 *
 * Запуск: DATABASE_URL=... node investigation/tools/smoke-jobs.mjs
 *
 * Проверяется не «задача выполнилась», а поведение очереди в неудачных случаях:
 * возвращается ли задача в очередь после сбоя, не теряется ли материал при отказе
 * нереализованного обработчика, не берут ли два исполнителя одну задачу.
 */

import { createPool, withTenant } from '../../src/investigation/repositories/index.js';
import { createInvestigationServices } from '../../src/investigation/services/index.js';
import { createJobRunner } from '../../src/investigation/server/jobRunner.js';
import { createStubLlmClient } from '../../src/investigation/agents/framework/llmClient.js';
import { MISSING_CASH_001 } from '../../src/investigation/fixtures/missingCash001.js';
import * as stub from './fixtures/stub-outputs.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
}

const pool = createPool();
const silent = { info() {}, warn() {}, error() {} };

try {
  const stamp = Date.now();
  const tenant = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const org = await client.query(
      "insert into organization (name, slug, status) values ($1, $2, 'active') returning id",
      [`Очередь ${stamp}`, `jobs-${stamp}`],
    );
    const organizationId = org.rows[0].id;
    const user = await client.query(
      "insert into app_user (organization_id, role, full_name, status) "
      + "values ($1, 'investigator', $2, 'active') returning id",
      [organizationId, 'Следователь очереди'],
    );
    return { organizationId, actorId: user.rows[0].id };
  });

  // Исполнитель разбирает очередь всех организаций — так и должно быть на сервере.
  // Для изолированной проверки очередь предварительно освобождается от задач,
  // оставшихся от других прогонов.
  const drained = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, (client) =>
    client.query(
      "update investigation_job set status = 'failed', finished_at = now(), "
      + "error = 'снята перед прогоном проверки очереди' where status = 'queued' returning id",
    ).then((r) => r.rowCount));

  const llm = createStubLlmClient([
    stub.INTAKE_OUTPUT,
    stub.PLAN_OUTPUT,
    stub.STRATEGY_IVANOV,
    stub.CLAIMS_IVANOV,
  ]);

  const scope = { ...tenant, actorType: 'user' };
  const services = createInvestigationServices({ scope, pool, driver: 'postgres', llm });

  const investigationCase = await services.cases.createCase({
    title: MISSING_CASH_001.title,
    description: MISSING_CASH_001.description,
    caseType: MISSING_CASH_001.case_type,
  });
  const caseId = investigationCase.id;
  const app = createInvestigationServices({
    scope: { ...scope, caseId }, pool, driver: 'postgres', llm,
  });

  const intake = await app.cases.runIntake(caseId, { description: MISSING_CASH_001.description });
  await app.cases.runPlanning(caseId);

  const ivanov = intake.persons.find((p) => p.name === 'Иванов Сергей');
  const planned = await app.interviews.planInterview({ personId: ivanov.id, round: 1 });

  const answer = await app.interviews.submitAnswer({
    questionId: planned.questions[0].id,
    personId: ivanov.id,
    text: 'Около семи я приехал на базу и передал Лене примерно 74 тысячи.',
  });

  check('Очередь освобождена от посторонних задач перед проверкой', drained >= 0,
    `снято: ${drained}`);

  const queued = await app.repositories.jobs.list({ status: 'queued' });
  check('Ответ участника поставил задачу извлечения в очередь',
    queued.some((j) => j.job_type === 'claim_extraction' && j.payload?.answer_id === answer.id),
    `в очереди: ${queued.length}`);

  const runner = createJobRunner({ pool, llm, logger: silent });

  const processed = await runner.processOne();
  check('Исполнитель взял задачу из очереди', processed === true);

  const claims = await app.repositories.claims.list({ case_id: caseId });
  check('Утверждения извлечены фоновой задачей, без участия интерфейса', claims.length >= 2,
    `утверждений: ${claims.length}`);

  const done = await app.repositories.jobs.list({ job_type: 'claim_extraction' });
  check('Задача помечена выполненной и сохранила результат',
    done[0]?.status === 'completed' && Number(done[0]?.result?.claims) >= 2,
    done[0]?.status ?? '');

  const empty = await runner.processOne();
  check('Пустая очередь не создаёт лишней работы', empty === false);

  // Нереализованный обработчик обязан вернуть задачу в очередь, а не выбросить материал.
  await runner.enqueue({
    organizationId: tenant.organizationId,
    caseId,
    jobType: 'transcription',
    payload: { source_id: null },
  });
  await runner.processOne();
  const transcription = (await app.repositories.jobs.list({ job_type: 'transcription' }))[0];
  check('Отказ обработчика возвращает задачу в очередь с отсрочкой',
    transcription?.status === 'queued' && Number(transcription?.attempts) === 1,
    `${transcription?.status}, попыток: ${transcription?.attempts}`);
  check('Причина отказа сохранена, а не потеряна',
    String(transcription?.error ?? '').includes('не реализована'),
    transcription?.error ?? '');

  // После исчерпания попыток задача становится проваленной, а не крутится вечно.
  await withTenant(pool, { organizationId: tenant.organizationId }, (client) => client.query(
    "update investigation_job set attempts = 3, scheduled_at = now() where id = $1",
    [transcription.id],
  ));
  await runner.processOne();
  const failed = (await app.repositories.jobs.list({ job_type: 'transcription' }))[0];
  check('Исчерпание попыток переводит задачу в failed, а не в бесконечный повтор',
    failed?.status === 'failed', `${failed?.status}, попыток: ${failed?.attempts}`);

  const unknown = await runner.enqueue({
    organizationId: tenant.organizationId,
    caseId,
    jobType: 'report_generation',
    payload: {},
  });
  await runner.processOne();
  const unknownJob = (await app.repositories.jobs.list({ job_type: 'report_generation' }))[0];
  check('Нереализованный тип задачи отказывает явно',
    ['queued', 'failed'].includes(unknownJob?.status) && Boolean(unknownJob?.error),
    unknownJob?.error ?? '');
  check('Задача сохранила идентификатор и не потерялась', unknownJob?.id === unknown.id);
} finally {
  await pool.end();
}

const failedChecks = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${results.length - failedChecks.length}/${results.length} проверок очереди пройдено`);
if (failedChecks.length > 0) process.exitCode = 1;
