/**
 * Применение миграций схемы.
 *
 * Запуск: DATABASE_URL=... node investigation/tools/migrate.mjs
 *
 * Миграции применяются по возрастанию имени, каждая в своей транзакции, и записываются
 * в schema_migration вместе с хэшем содержимого. Хэш нужен не для красоты: изменённая
 * задним числом миграция, уже применённая на production, — источник расхождений,
 * которые обнаруживаются в худший момент. Такое расхождение останавливает запуск.
 */

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../../src/investigation/repositories/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'db', 'migrations');

const pool = createPool();
const client = await pool.connect();

try {
  await client.query(`
    create table if not exists schema_migration (
      name text primary key,
      sha256 text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Map(
    (await client.query('select name, sha256 from schema_migration')).rows
      .map((row) => [row.name, row.sha256]),
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;

  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    const sha256 = createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(file);

    if (previous && previous !== sha256) {
      throw new Error(
        `Миграция ${file} изменена после применения. Схема на сервере не соответствует `
        + 'репозиторию: создайте новую миграцию вместо правки применённой.',
      );
    }
    if (previous) continue;

    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(
        'insert into schema_migration (name, sha256) values ($1, $2)',
        [file, sha256],
      );
      await client.query('commit');
      console.log(`применена ${file}`);
      count += 1;
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Миграция ${file} не применена: ${error.message}`);
    }
  }

  console.log(count === 0 ? 'схема актуальна' : `применено миграций: ${count}`);

  // Права роли приложения выдаются здесь, а не отдельным шагом инструкции.
  // Таблица, добавленная будущей миграцией и забытая в grant, — это отказ в доступе
  // на production через недели после того, как миграцию писали.
  const appRole = process.env.APP_DB_ROLE;
  if (appRole) {
    if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) {
      throw new Error(`Недопустимое имя роли приложения: ${appRole}`);
    }
    await client.query(`grant usage on schema public to ${appRole}`);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${appRole}`);
    await client.query(`grant usage, select on all sequences in schema public to ${appRole}`);
    await client.query(
      `alter default privileges in schema public
       grant select, insert, update, delete on tables to ${appRole}`,
    );
    await client.query(
      `alter default privileges in schema public grant usage, select on sequences to ${appRole}`,
    );

    // Роль приложения обязана подчиняться RLS: без этого вся изоляция арендаторов
    // держится только на аккуратности запросов.
    const bypass = await client.query('select rolbypassrls from pg_roles where rolname = $1', [appRole]);
    if (bypass.rows[0]?.rolbypassrls) {
      throw new Error(
        `Роль ${appRole} имеет bypassrls: изоляция арендаторов не работает. `
        + `Выполните: alter role ${appRole} nobypassrls;`,
      );
    }
    console.log(`права выданы роли ${appRole}, bypassrls отсутствует`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
