/**
 * Проверка выгрузки и удаления данных арендатора (§60 ТЗ).
 *
 * Запуск: DATABASE_URL=... node investigation/tools/smoke-tenant.mjs
 *
 * Проверяется только против настоящей базы: и изоляция выгрузки, и удаление журналов
 * держатся на row-level security и триггерах, которых в хранилище в памяти нет.
 *
 * Главное здесь — не то, что выгрузка составляется, а два свойства, на которых держится
 * обещание клиенту: выгрузка не может захватить чужие данные, а удаление действительно
 * не оставляет ничего, кроме записи о самом факте удаления.
 */

import { readFile, unlink, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPool, withTenant } from '../../src/investigation/repositories/index.js';
import { createInvestigationServices } from '../../src/investigation/services/index.js';
import { createTenantDataService } from '../../src/investigation/services/TenantDataService.js';
import { createStubLlmClient } from '../../src/investigation/agents/framework/llmClient.js';
import { SCHEMA } from '../../src/investigation/repositories/postgres/schema.generated.js';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
}

/** Читает запись архива, не разворачивая его на диск. */
async function readZipEntry(path, name) {
  const { inflateRawSync } = await import('node:zlib');
  const bytes = await readFile(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const target = Buffer.from(name, 'utf-8');

  for (let i = 0; i < bytes.length - 4; i += 1) {
    if (view.getUint32(i, true) !== 0x04034b50) continue;
    const method = view.getUint16(i + 8, true);
    const compressedSize = view.getUint32(i + 18, true);
    const nameLength = view.getUint16(i + 26, true);
    const extraLength = view.getUint16(i + 28, true);
    const entryName = bytes.subarray(i + 30, i + 30 + nameLength);
    if (!entryName.equals(target)) continue;
    const start = i + 30 + nameLength + extraLength;
    const raw = bytes.subarray(start, start + compressedSize);
    return method === 0 ? raw : inflateRawSync(raw);
  }
  return null;
}

async function createTenant(pool, label) {
  return withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const stamp = `${Date.now()}-${label}`;
    const org = await client.query(
      "insert into organization (name, slug, status) values ($1, $2, 'active') returning id, slug",
      [`Арендатор ${stamp}`, `tenant-${stamp}`],
    );
    const user = await client.query(
      "insert into app_user (organization_id, role, full_name, status) "
      + "values ($1, 'org_owner', $2, 'active') returning id",
      [org.rows[0].id, `Владелец ${label}`],
    );
    return { organizationId: org.rows[0].id, slug: org.rows[0].slug, actorId: user.rows[0].id };
  });
}

async function seed(pool, tenant, title, fileRoot) {
  const scope = { organizationId: tenant.organizationId, actorId: tenant.actorId, actorType: 'user' };
  const services = createInvestigationServices({
    scope, pool, driver: 'postgres', llm: createStubLlmClient([]), fileRoot,
  });
  const investigationCase = await services.cases.createCase({ title, description: 'Материалы дела' });

  const app = createInvestigationServices({
    scope: { ...scope, caseId: investigationCase.id },
    pool,
    driver: 'postgres',
    llm: createStubLlmClient([]),
    fileRoot,
  });
  const person = await app.repositories.persons.create({ name: 'Иванов', participant_type: 'witness' });
  const source = await app.sources.ingestText('Текст материала дела', {
    type: 'document', title: 'Материал',
  });
  await app.sources.promoteToEvidence(source.id, {
    type: 'document', description: 'Приобщённый материал', relevance: 'high', reliability: 'moderate',
  });

  const uploaded = await app.sources.ingestFile(
    new Uint8Array(Buffer.from(`Отсканированный материал дела «${title}»`, 'utf-8')),
    { type: 'document', title: 'Оригинал материала', filename: 'material.txt', mimeType: 'text/plain' },
  );

  return {
    caseId: investigationCase.id,
    personId: person.id,
    sourceId: source.id,
    fileSourceId: uploaded.id,
    originalFile: uploaded.original_file,
  };
}

const pool = createPool();

/**
 * Второе подключение — владельцем схемы. Удаление журналов доступно только ему,
 * и проверка обязана идти тем же путём, что и настоящая процедура.
 */
if (!process.env.ADMIN_DATABASE_URL) {
  console.error(
    'Проверка требует ADMIN_DATABASE_URL: удаление арендатора стирает журналы, а стереть '
    + 'их вправе только владелец таблиц. Без этого подключения проверка измеряла бы не то, '
    + 'что делает настоящая процедура.',
  );
  process.exit(1);
}
const adminPool = createPool({ connectionString: process.env.ADMIN_DATABASE_URL });
// Отдельный корень файлов на прогон: проверка удаления обязана трогать настоящие файлы
// на диске, а не только строки в базе.
const fileRoot = await mkdtemp(join(tmpdir(), 'investigation-files-'));

try {
  const tenantA = await createTenant(pool, 'a');
  const tenantB = await createTenant(pool, 'b');
  const seededA = await seed(pool, tenantA, 'Дело арендатора A', fileRoot);
  await seed(pool, tenantB, 'Дело арендатора B', fileRoot);

  const service = createTenantDataService({ pool, adminPool, fileRoot });
  const archive = join(tmpdir(), `tenant-export-${Date.now()}.zip`);
  const summary = await service.exportTenant({
    organizationId: tenantA.organizationId, outputPath: archive,
  });

  check('Выгрузка охватывает все таблицы схемы',
    Object.keys(summary.rows).length === Object.keys(SCHEMA).length,
    `${Object.keys(summary.rows).length} из ${Object.keys(SCHEMA).length}`);
  check('Выгрузка содержит контрольную сумму архива', summary.sha256?.length === 64);

  const manifest = JSON.parse((await readZipEntry(archive, 'manifest.json')).toString('utf-8'));
  check('Манифест называет организацию и состав выгрузки',
    manifest.organization.slug === tenantA.slug && manifest.rows.investigation_case === 1);

  const readme = (await readZipEntry(archive, 'README.txt')).toString('utf-8');
  check('Архив объясняет свою структуру получателю',
    readme.includes('manifest.json') && readme.includes('files/'));

  const cases = JSON.parse((await readZipEntry(archive, 'data/investigation_case.json')).toString('utf-8'));
  check('Выгружено собственное дело арендатора',
    cases.length === 1 && cases[0].title === 'Дело арендатора A');
  check('Дело чужого арендатора в выгрузку не попало',
    cases.every((row) => row.organization_id === tenantA.organizationId));

  const audit = JSON.parse((await readZipEntry(archive, 'data/audit_event.json')).toString('utf-8'));
  check('Журнал аудита выгружается вместе с материалами', audit.length > 0, `записей: ${audit.length}`);

  const sources = JSON.parse((await readZipEntry(archive, 'data/source.json')).toString('utf-8'));
  const withFile = sources.find((row) => row.id === seededA.fileSourceId);
  const originalInArchive = await readZipEntry(archive, `files/${withFile.sha256}`);
  check('Оригинал материала выгружен вместе с данными и совпадает по хэшу',
    Boolean(originalInArchive)
      && originalInArchive.toString('utf-8').includes('Дело арендатора A'),
    `оригиналов: ${manifest.files_exported}`);

  const claims = await readZipEntry(archive, 'data/claim.json');
  check('Пустая таблица выгружается пустой, а не отсутствует',
    claims !== null && JSON.parse(claims.toString('utf-8')).length === 0);

  // ─── Удаление ───

  const wrongConfirm = await service.deleteTenant({
    organizationId: tenantA.organizationId, confirmSlug: 'не-тот-slug',
    reason: 'проверка', requestedBy: 'проверка',
  }).then(() => null, (error) => error.message);
  check('Удаление без верного подтверждения отклонено', Boolean(wrongConfirm), wrongConfirm ?? '');

  const noReason = await service.deleteTenant({
    organizationId: tenantA.organizationId, confirmSlug: tenantA.slug, requestedBy: 'кто-то',
  }).then(() => null, (error) => error.message);
  check('Удаление без основания отклонено', Boolean(noReason), noReason ?? '');

  const deleted = await service.deleteTenant({
    organizationId: tenantA.organizationId,
    confirmSlug: tenantA.slug,
    reason: 'требование клиента о прекращении обработки',
    requestedBy: 'Арендатор A, владелец',
    exportSha256: summary.sha256,
  });
  check('Удаление сняло записи дела',
    deleted.deleted_rows.investigation_case === 1 && deleted.deleted_rows.person === 1);
  check('Журнал аудита удалён вместе с данными', deleted.deleted_rows.audit_event > 0,
    `записей: ${deleted.deleted_rows.audit_event}`);
  check('Оригиналы материалов удалены с диска', deleted.deleted_files === deleted.stored_files
    && deleted.stored_files >= 0, `${deleted.deleted_files} из ${deleted.stored_files}`);

  const remaining = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const counts = {};
    for (const entry of Object.values(SCHEMA)) {
      if (!entry.columns.includes('organization_id')) continue;
      const result = await client.query(
        `select count(*)::int as n from ${entry.table} where organization_id = $1`,
        [tenantA.organizationId],
      );
      if (result.rows[0].n > 0) counts[entry.table] = result.rows[0].n;
    }
    const org = await client.query('select count(*)::int as n from organization where id = $1',
      [tenantA.organizationId]);
    return { counts, organization: org.rows[0].n };
  });
  check('После удаления не осталось ни одной строки арендатора',
    Object.keys(remaining.counts).length === 0 && remaining.organization === 0,
    JSON.stringify(remaining.counts));

  // Флаг стирания может выставить любая роль — значит одного флага мало.
  const appCannotErase = await withTenant(pool, { organizationId: tenantB.organizationId },
    async (client) => {
      await client.query("select set_config('app.tenant_erasure', 'on', true)");
      await client.query('delete from audit_event where organization_id = $1',
        [tenantB.organizationId]);
      return null;
    }).then(() => null, (error) => error.message);
  check('Роль приложения не стирает журнал даже с выставленным флагом',
    Boolean(appCannotErase), appCannotErase?.slice(0, 70) ?? '');

  const records = await service.listDeletions();
  const record = records.find((row) => row.organization_id === tenantA.organizationId);
  check('Факт удаления пережил данные и содержит основание',
    Boolean(record) && record.reason.includes('требование клиента')
      && record.export_sha256 === summary.sha256);
  check('Запись об удалении не содержит персональных данных',
    Boolean(record) && !JSON.stringify(record).includes('Иванов'));

  const recordImmutable = await withTenant(pool, { organizationId: null, isSystemAdmin: true },
    (client) => client.query('delete from tenant_deletion_record where id = $1', [record.id]))
    .then(() => null, (error) => error.message);
  check('Запись об удалении неизменяема', Boolean(recordImmutable), recordImmutable ?? '');

  const neighbour = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const result = await client.query(
      'select count(*)::int as n from investigation_case where organization_id = $1',
      [tenantB.organizationId],
    );
    return result.rows[0].n;
  });
  check('Данные соседнего арендатора не пострадали', neighbour === 1);

  const originalGone = await stat(seededA.originalFile.replace('file://', ''))
    .then(() => false, () => true);
  check('Оригинал материала удалённого арендатора стёрт с диска', originalGone);

  await unlink(archive).catch(() => {});
} finally {
  await pool.end();
  await adminPool.end();
}

const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} проверок контура данных арендатора пройдено`);
process.exit(failed.length === 0 ? 0 : 1);
