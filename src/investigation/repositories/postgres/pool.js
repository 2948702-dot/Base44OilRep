/**
 * Подключение к PostgreSQL и контекст арендатора.
 *
 * Изоляция арендатора обеспечивается row-level security самой базы. Приложение обязано
 * подключаться ролью БЕЗ bypassrls и выставлять `app.organization_id` на каждом запросе.
 * Если переменная не выставлена, политики не показывают ни одной строки — это намеренно:
 * забытый контекст должен приводить к пустому результату, а не к утечке.
 */

import pg from 'pg';

const { Pool, types } = pg;

// numeric приходит из драйвера строкой, чтобы не терять точность на больших суммах.
// Для денег расследования это существенно: 74 000,00 не должно стать 74000.00000000001.
types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

/**
 * @param {{connectionString?: string, max?: number}} [options]
 * @returns {import('pg').Pool}
 */
export function createPool(options = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL не задан: подключение к базе расследований невозможно');
  }
  return new Pool({
    connectionString,
    max: options.max ?? 10,
    idle_in_transaction_session_timeout: 30_000,
    statement_timeout: 30_000,
  });
}

/**
 * Выполняет работу в транзакции с выставленным контекстом арендатора.
 *
 * `set_config(..., true)` делает значение локальным для транзакции: соединение,
 * вернувшееся в пул, не унесёт чужой контекст следующему запросу.
 *
 * @template T
 * @param {import('pg').Pool} pool
 * @param {{organizationId: string, isSystemAdmin?: boolean}} scope
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTenant(pool, scope, work) {
  if (!scope?.organizationId && !scope?.isSystemAdmin) {
    throw new Error('Обращение к базе без organizationId запрещено');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select set_config($1, $2, true)', [
      'app.organization_id',
      scope.organizationId ?? '',
    ]);
    await client.query('select set_config($1, $2, true)', [
      'app.is_system_admin',
      scope.isSystemAdmin ? 'on' : 'off',
    ]);
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Транзакция, разделяемая несколькими репозиториями.
 *
 * Нужна там, где раньше приходилось мириться с полусостоянием: сохранение плана
 * расследования — это issues, hypotheses, revisions и tasks одной операцией.
 * Обрыв на середине больше не оставляет дело недособранным.
 *
 * @template T
 * @param {Object} db
 * @param {(tx: Object) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function inTransaction(db, work) {
  if (db.client) return work(db);
  return withTenant(db.pool, db.scope, async (client) => work({ ...db, client }));
}

/**
 * Выполняет запрос: внутри уже открытой транзакции — на её клиенте, иначе — в новой.
 *
 * @param {Object} db
 * @param {string} sql
 * @param {unknown[]} params
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(db, sql, params = []) {
  if (db.client) return db.client.query(sql, params);
  return withTenant(db.pool, db.scope, (client) => client.query(sql, params));
}
