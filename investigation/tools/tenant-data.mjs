/**
 * Выгрузка и удаление данных арендатора (§60 ТЗ).
 *
 * Запуск на сервере:
 *   node investigation/tools/tenant-data.mjs --list
 *   node investigation/tools/tenant-data.mjs --export --slug <slug> --out /path/archive.zip
 *   node investigation/tools/tenant-data.mjs --delete --slug <slug> --confirm <slug> \
 *        --reason "требование клиента от 2026-08-26" --requested-by "ООО Пример, директор"
 *
 * Инструмент намеренно не имеет HTTP-маршрута. Выгрузка и удаление арендатора —
 * действия оператора платформы, а не операции интерфейса: у них нет отмены, и они
 * должны требовать доступа к серверу, а не одной кнопки в браузере.
 */

import { createPool, withTenant } from '../../src/investigation/repositories/index.js';
import { createTenantDataService } from '../../src/investigation/services/TenantDataService.js';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}
const has = (name) => process.argv.includes(`--${name}`);

const pool = createPool();

/**
 * Удаление арендатора стирает журналы, а стереть их вправе только владелец таблиц:
 * роль приложения этого не может, и это защита, а не неудобство. Подключение
 * владельца берётся из ADMIN_DATABASE_URL — того же, которым применяются миграции.
 */
const adminPool = process.env.ADMIN_DATABASE_URL
  ? createPool({ connectionString: process.env.ADMIN_DATABASE_URL })
  : null;

const service = createTenantDataService({ pool, adminPool: adminPool ?? undefined });

async function findOrganization(slug) {
  const row = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const result = await client.query('select id, name, slug from organization where slug = $1', [slug]);
    return result.rows[0] ?? null;
  });
  if (!row) throw new Error(`Организация со slug «${slug}» не найдена`);
  return row;
}

try {
  if (has('list')) {
    const rows = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
      const result = await client.query(
        'select id, name, slug, status, created_at from organization order by created_at asc',
      );
      return result.rows;
    });
    for (const row of rows) {
      console.log(`${row.slug}\t${row.status}\t${row.name}\t${row.id}`);
    }

    const deletions = await service.listDeletions();
    if (deletions.length > 0) {
      console.log('\nУдалённые арендаторы:');
      for (const row of deletions) {
        console.log(`${row.deleted_at.toISOString?.() ?? row.deleted_at}\t${row.organization_slug}`
          + `\t${row.requested_by}\t${row.reason}`);
      }
    }
  } else if (has('export')) {
    const slug = arg('slug');
    const out = arg('out');
    if (!slug || !out) throw new Error('Требуются --slug и --out');

    const organization = await findOrganization(slug);
    const summary = await service.exportTenant({
      organizationId: organization.id,
      outputPath: out,
      includeFiles: !has('without-files'),
    });

    console.log(`Выгрузка организации «${summary.organization.name}» готова: ${summary.path}`);
    console.log(`Записей: ${Object.values(summary.rows).reduce((a, b) => a + b, 0)}`
      + ` в ${Object.keys(summary.rows).length} таблицах`);
    console.log(`Оригиналов материалов: ${summary.files_exported}`
      + (summary.files_missing > 0 ? `, недоступно: ${summary.files_missing}` : ''));
    console.log(`Размер: ${summary.bytes} байт`);
    console.log(`SHA-256 архива: ${summary.sha256}`);
    console.log('\nКонтрольную сумму передайте вместе с архивом: получатель должен иметь');
    console.log('возможность убедиться, что файл дошёл без изменений.');
  } else if (has('delete')) {
    const slug = arg('slug');
    const confirm = arg('confirm');
    const reason = arg('reason');
    const requestedBy = arg('requested-by');
    if (!slug || !confirm || !reason || !requestedBy) {
      throw new Error('Требуются --slug, --confirm, --reason и --requested-by');
    }

    if (!adminPool) {
      throw new Error(
        'Удаление арендатора требует ADMIN_DATABASE_URL: журналы стирает только владелец '
        + 'таблиц, роль приложения этого не может',
      );
    }

    const organization = await findOrganization(slug);
    const result = await service.deleteTenant({
      organizationId: organization.id,
      confirmSlug: confirm,
      reason,
      requestedBy,
      exportSha256: arg('export-sha256') ?? undefined,
    });

    const total = Object.values(result.deleted_rows).reduce((a, b) => a + b, 0);
    console.log(`Данные организации «${organization.name}» удалены.`);
    console.log(`Удалено записей: ${total}, оригиналов материалов: ${result.deleted_files}`
      + ` из ${result.stored_files}`);
    console.log('Факт удаления записан в tenant_deletion_record и переживёт сами данные.');
  } else {
    console.log('Укажите --list, --export или --delete. Подробности — в заголовке файла.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
  if (adminPool) await adminPool.end();
}
