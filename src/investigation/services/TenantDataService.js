/**
 * Экспорт и удаление данных арендатора (§60 ТЗ).
 *
 * Продажа внешним клиентам делает это не пожеланием, а условием: организация вправе
 * забрать свои материалы и вправе потребовать их удаления. Обещание, не подкреплённое
 * работающей процедурой, — это обещание, которое выяснится невыполнимым в худший момент.
 *
 * Два свойства этих процедур важнее удобства.
 *
 * Экспорт идёт под областью видимости самой организации. Row-level security при этом
 * не отключается, поэтому выгрузка физически не может захватить чужие данные — даже
 * при ошибке в перечне таблиц.
 *
 * Удаление, наоборот, требует прав системного администратора и включает флаг
 * `app.tenant_erasure` внутри своей транзакции: без него журналы удалить нельзя.
 * Факт удаления записывается в `tenant_deletion_record`, который переживает сами данные.
 */

import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { withTenant } from '../repositories/postgres/pool.js';
import { SCHEMA } from '../repositories/postgres/schema.generated.js';
import { createZipWriter } from '../server/zip.js';
import { createFileRepository } from '../repositories/postgres/createFileRepository.js';

export const EXPORT_FORMAT_VERSION = '1';

/** Таблицы, выгружаемые целиком, в порядке чтения. */
const TABLES = Object.values(SCHEMA).map((entry) => entry.table);

/**
 * @param {Object} params
 * @param {import('pg').Pool} params.pool подключение приложения
 * @param {import('pg').Pool} [params.adminPool] подключение владельца схемы; нужно
 *   для удаления арендатора: журналы стирает только владелец таблиц, и роль
 *   приложения не сотрёт их, даже выставив флаг
 * @param {string} [params.fileRoot]
 */
export function createTenantDataService({ pool, adminPool, fileRoot }) {
  const files = createFileRepository({ root: fileRoot });
  const erasurePool = adminPool ?? pool;

  async function readOrganization(organizationId, { asSystemAdmin = false } = {}) {
    const scope = asSystemAdmin
      ? { organizationId: null, isSystemAdmin: true }
      : { organizationId };
    return withTenant(asSystemAdmin ? erasurePool : pool, scope, async (client) => {
      const result = await client.query('select * from organization where id = $1', [organizationId]);
      return result.rows[0] ?? null;
    });
  }

  return {
    /**
     * Полная выгрузка данных организации в архив.
     *
     * Архив самоописателен: рядом с данными лежит manifest со списком таблиц и числом
     * строк и пояснение к структуре. Выгрузка, которую нельзя прочитать без исходного
     * кода платформы, не является выдачей данных.
     *
     * @param {Object} params
     * @param {string} params.organizationId
     * @param {string} params.outputPath
     * @param {boolean} [params.includeFiles] выгружать ли оригиналы материалов
     * @returns {Promise<Object>} сводка выгрузки
     */
    async exportTenant({ organizationId, outputPath, includeFiles = true }) {
      const organization = await readOrganization(organizationId);
      if (!organization) throw new Error(`Организация ${organizationId} не найдена`);

      const zip = await createZipWriter(outputPath);
      const counts = {};
      let exportedFiles = 0;
      let skippedFiles = 0;

      const sources = [];

      await withTenant(pool, { organizationId }, async (client) => {
        for (const table of TABLES) {
          const result = await client.query(`select * from ${table} order by created_at asc`);
          counts[table] = result.rowCount;
          await zip.add(`data/${table}.json`, JSON.stringify(result.rows, null, 2));
          if (table === 'source') sources.push(...result.rows);
        }
      });

      if (includeFiles) {
        for (const source of sources) {
          if (!source.original_file) continue;
          try {
            const bytes = await files.read(source.original_file);
            await zip.add(`files/${source.sha256 ?? source.id}`, new Uint8Array(bytes));
            exportedFiles += 1;
          } catch {
            // Недоступный оригинал не отменяет выгрузку остального, но и не замалчивается:
            // получатель должен знать, что файл в архив не попал.
            skippedFiles += 1;
          }
        }
      }

      const manifest = {
        export_format_version: EXPORT_FORMAT_VERSION,
        generated_at: new Date().toISOString(),
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          country: organization.country,
        },
        rows: counts,
        files_exported: exportedFiles,
        files_missing: skippedFiles,
      };
      await zip.add('manifest.json', JSON.stringify(manifest, null, 2));
      await zip.add('README.txt', readme(manifest));

      const summary = await zip.close();
      const sha256 = await hashFile(outputPath);

      return { ...manifest, ...summary, path: outputPath, sha256 };
    },

    /**
     * Удаление всех данных организации.
     *
     * Требует явного подтверждения slug'ом: удаление арендатора необратимо, и защита
     * от опечатки здесь стоит дороже удобства. Каскад идёт от строки организации;
     * журналы удаляются только благодаря флагу, который ставит эта процедура.
     *
     * @param {Object} params
     * @param {string} params.organizationId
     * @param {string} params.confirmSlug
     * @param {string} params.reason
     * @param {string} params.requestedBy
     * @param {string} [params.exportSha256] контрольная сумма выданной выгрузки
     */
    async deleteTenant({ organizationId, confirmSlug, reason, requestedBy, exportSha256 }) {
      if (!reason) throw new Error('Удаление данных арендатора требует основания');
      if (!requestedBy) throw new Error('Удаление данных арендатора требует указания заказчика');

      const organization = await readOrganization(organizationId, { asSystemAdmin: true });
      if (!organization) throw new Error(`Организация ${organizationId} не найдена`);
      if (organization.slug !== confirmSlug) {
        throw new Error(
          `Подтверждение не совпадает: ожидался slug «${organization.slug}». `
          + 'Удаление данных арендатора необратимо.',
        );
      }

      const scope = { organizationId: null, isSystemAdmin: true };

      // Оригиналы собираются до удаления строк: после каскада ссылок на файлы не останется.
      const storedFiles = await withTenant(erasurePool, scope, async (client) => {
        const result = await client.query(
          'select original_file from source where organization_id = $1 and original_file is not null',
          [organizationId],
        );
        return result.rows.map((row) => row.original_file);
      });

      // withTenant открывает транзакцию: флаг стирания и само удаление обязаны быть
      // в одной транзакции, иначе флаг переживёт операцию на этом соединении.
      const deletedRows = await withTenant(erasurePool, scope, async (client) => {
        await client.query("select set_config('app.tenant_erasure', 'on', true)");

        // Строки считаются до удаления: после каскада считать будет нечего, а запись
        // «удалено ноль строк» ничего не подтверждает.
        const counts = {};
        for (const table of TABLES) {
          if (table === 'organization' || !hasOrganizationColumn(table)) continue;
          const result = await client.query(
            `select count(*)::int as n from ${table} where organization_id = $1`, [organizationId],
          );
          counts[table] = result.rows[0].n;
        }

        await client.query('delete from organization where id = $1', [organizationId]);

        await client.query(
          `insert into tenant_deletion_record
             (organization_id, organization_slug, organization_name, requested_by, reason,
              deleted_rows, deleted_files, export_sha256)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            organizationId, organization.slug, organization.name, requestedBy, reason,
            JSON.stringify(counts), storedFiles.length, exportSha256 ?? null,
          ],
        );

        return counts;
      });

      // Файлы удаляются после того, как база подтвердила удаление строк: обратный
      // порядок оставил бы дело со ссылками на исчезнувшие оригиналы.
      let deletedFiles = 0;
      for (const uri of storedFiles) {
        if (await files.remove(uri)) deletedFiles += 1;
      }

      return {
        organization_id: organizationId,
        organization_slug: organization.slug,
        deleted_rows: deletedRows,
        deleted_files: deletedFiles,
        stored_files: storedFiles.length,
      };
    },

    /** Записи об удалённых арендаторах. Доступны только системному администратору. */
    async listDeletions() {
      return withTenant(erasurePool, { organizationId: null, isSystemAdmin: true }, async (client) => {
        const result = await client.query(
          'select * from tenant_deletion_record order by deleted_at desc limit 200',
        );
        return result.rows;
      });
    },
  };
}

/** Есть ли у таблицы колонка организации. */
function hasOrganizationColumn(table) {
  const entry = Object.values(SCHEMA).find((item) => item.table === table);
  return Boolean(entry?.columns.includes('organization_id'));
}

async function hashFile(path) {
  const { readFile } = await import('node:fs/promises');
  await stat(path);
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function readme(manifest) {
  return `Выгрузка данных организации «${manifest.organization.name}»
Сформирована: ${manifest.generated_at}
Версия формата выгрузки: ${manifest.export_format_version}

Структура архива:

  manifest.json      состав выгрузки: организация, перечень таблиц и число строк
  data/<таблица>.json  все строки таблицы, относящиеся к этой организации
  files/<sha256>     оригиналы материалов дел; имя файла — хэш содержимого

Данные выгружены в том виде, в каком хранятся: даты в UTC, идентификаторы —
UUID, ссылки между таблицами сохранены. Утверждения участников (claim) ссылаются
на источник (source) и на позицию в нём, доказательства (evidence) — на источник,
выводы (finding) — на доказательства. Оригиналы материалов не изменялись: хэш
в имени файла совпадает с полем sha256 соответствующего источника.

Журнал аудита (data/audit_event.json) содержит все изменения материалов дел
с указанием того, кто и когда их внёс.

В выгрузку намеренно не входят сессии пользователей платформы: они содержат
только хэши действующих токенов входа и не относятся к материалам расследований.
`;
}
