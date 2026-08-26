/**
 * Реализация EntityRepository поверх PostgreSQL.
 *
 * В отличие от прежней реализации, здесь фильтрация по организации — не единственная
 * защита: RLS базы отклонит чужую строку, даже если запрос собран неверно. Фильтр
 * остаётся ради индексов и явности, а не как граница безопасности.
 */

import { assertImplements } from '../contracts.js';
import { query } from './pool.js';

/** Системные колонки, которые никогда не приходят из полезной нагрузки. */
const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

/** Таблицы, которые база запрещает изменять после записи. */
const APPEND_ONLY = new Set(['audit_event', 'agent_run', 'hypothesis_revision', 'benchmark_result']);

/**
 * @param {Object} params
 * @param {Object} params.db
 * @param {string} params.table
 * @param {string[]} params.columns колонки таблицы, известные из схемы
 * @param {string[]} [params.jsonColumns] колонки jsonb, требующие явной сериализации
 * @param {import('../contracts.js').RepositoryScope} params.scope
 * @param {{record: Function}} [params.audit]
 * @param {boolean} [params.caseScoped]
 */
export function createEntityRepository({
  db, table, columns, jsonColumns = [], scope, audit, caseScoped = true,
}) {
  if (!scope?.organizationId) {
    throw new Error(`Репозиторий ${table} создан без organizationId`);
  }

  const columnSet = new Set(columns);
  const jsonSet = new Set(jsonColumns);
  const appendOnly = APPEND_ONLY.has(table);

  /**
   * Значение для колонки jsonb. Драйвер сериализует объект сам, но массив превращает
   * в postgres-массив, и база отвергает его как некорректный JSON.
   */
  function toJsonParam(value) {
    return value === null || value === undefined ? null : JSON.stringify(value);
  }

  /**
   * Оставляет только известные схеме колонки и не даёт подменить организацию.
   *
   * Принадлежность делу проставляется только при создании. При обновлении это было бы
   * не удобством, а дырой: запрос к объекту чужого дела по его идентификатору переносил
   * бы объект в дело вызывающего вместе со всем содержимым.
   */
  function sanitize(data, { forCreate = false } = {}) {
    const payload = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      if (SYSTEM_COLUMNS.has(key)) continue;
      if (!columnSet.has(key)) continue;
      const normalized = value === '' || value === undefined ? null : value;
      payload[key] = jsonSet.has(key) ? toJsonParam(normalized) : normalized;
    }
    payload.organization_id = scope.organizationId;
    if (forCreate && caseScoped && scope.caseId && payload.case_id == null) {
      payload.case_id = scope.caseId;
    }
    if (!forCreate) delete payload.case_id;
    return payload;
  }

  /**
   * Условие принадлежности строки области видимости вызывающего.
   *
   * Граница организации держится RLS базы. Границу дела база не знает: для неё
   * `finding` дела A и дела B — строки одной таблицы одной организации. Поэтому она
   * проверяется здесь, один раз для всех маршрутов, а не в каждом обработчике: пропуск
   * в одном обработчике из двадцати — это и есть способ, которым такие проверки теряются.
   *
   * Строка без дела (журнал, задача очереди, документ методологии) остаётся доступной:
   * она относится к организации, а не к делу.
   */
  function scopeCondition(startIndex) {
    const conditions = [`organization_id = $${startIndex}`];
    const params = [scope.organizationId];
    if (caseScoped && scope.caseId) {
      params.push(scope.caseId);
      conditions.push(`(case_id is null or case_id = $${startIndex + 1})`);
    }
    return { sql: conditions.join(' and '), params };
  }

  function buildWhere(filter, { includeDeleted }) {
    const conditions = ['organization_id = $1'];
    const params = [scope.organizationId];

    if (caseScoped && scope.caseId && filter.case_id === undefined) {
      params.push(scope.caseId);
      conditions.push(`case_id = $${params.length}`);
    }

    for (const [key, value] of Object.entries(filter ?? {})) {
      if (!columnSet.has(key) || value === undefined) continue;
      if (value === null) {
        conditions.push(`${key} is null`);
        continue;
      }
      if (Array.isArray(value)) {
        params.push(value);
        conditions.push(`${key} = any($${params.length})`);
        continue;
      }
      params.push(value);
      conditions.push(`${key} = $${params.length}`);
    }

    if (!includeDeleted) conditions.push('deleted_at is null');

    return { where: conditions.join(' and '), params };
  }

  async function recordAudit(operation, objectId, oldValue, newValue, reason) {
    if (!audit) return;
    await audit.record({
      organization_id: scope.organizationId,
      case_id: scope.caseId ?? null,
      actor: scope.actorId,
      actor_type: scope.actorType,
      timestamp: new Date().toISOString(),
      object_type: table,
      object_id: objectId,
      operation,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      reason: reason ?? scope.reason ?? null,
    });
  }

  const repository = {
    async get(id) {
      const { sql, params } = scopeCondition(2);
      const result = await query(
        db,
        `select * from ${table} where id = $1 and deleted_at is null and ${sql}`,
        [id, ...params],
      );
      return result.rows[0] ?? null;
    },

    /**
     * Удалённые записи доступны только явным includeDeleted: расследование обязано
     * уметь показать, что было удалено и по какой причине.
     */
    async list(filter = {}, options = {}) {
      const { includeDeleted = false, limit, sort } = options;
      const { where, params } = buildWhere(filter, { includeDeleted });

      let sql = `select * from ${table} where ${where}`;
      if (sort) {
        const desc = sort.startsWith('-');
        const column = desc ? sort.slice(1) : sort;
        if (columnSet.has(column) || column === 'created_at') {
          sql += ` order by ${column} ${desc ? 'desc' : 'asc'}`;
        }
      } else {
        sql += ' order by created_at asc';
      }
      if (limit) {
        params.push(limit);
        sql += ` limit $${params.length}`;
      }

      const result = await query(db, sql, params);
      return result.rows;
    },

    async create(data) {
      const payload = sanitize(data, { forCreate: true });
      const keys = Object.keys(payload);
      const placeholders = keys.map((_, index) => `$${index + 1}`);
      const result = await query(
        db,
        `insert into ${table} (${keys.join(', ')}) values (${placeholders.join(', ')}) returning *`,
        Object.values(payload),
      );
      const created = result.rows[0];
      await recordAudit('create', created.id, null, payload);
      return created;
    },

    async update(id, data) {
      if (appendOnly) {
        throw new Error(`${table} — журнальная таблица: изменение запрещено`);
      }
      const before = await repository.get(id);
      if (!before) throw new Error(`${table}/${id} не найден в организации вызывающего`);

      const payload = sanitize(data);
      delete payload.organization_id;
      const keys = Object.keys(payload);
      if (keys.length === 0) return before;

      const assignments = keys.map((key, index) => `${key} = $${index + 2}`);
      const result = await query(
        db,
        `update ${table} set ${assignments.join(', ')} where id = $1 returning *`,
        [id, ...Object.values(payload)],
      );
      await recordAudit('update', id, before, payload);
      return result.rows[0];
    },

    async softDelete(id, reason) {
      if (appendOnly) {
        throw new Error(`${table} — журнальная таблица: удаление запрещено`);
      }
      if (!reason) {
        throw new Error('Soft delete требует причины: она попадает в журнал аудита');
      }
      const before = await repository.get(id);
      if (!before) throw new Error(`${table}/${id} не найден в организации вызывающего`);

      const result = await query(
        db,
        `update ${table} set deleted_at = now(), deleted_by = $2, deletion_reason = $3
         where id = $1 returning *`,
        [id, scope.actorId, reason],
      );
      await recordAudit('soft_delete', id, before, { deletion_reason: reason }, reason);
      return result.rows[0];
    },

    async restore(id, reason) {
      const { sql, params } = scopeCondition(2);
      const result = await query(
        db,
        `update ${table} set deleted_at = null, deleted_by = null, deletion_reason = null
         where id = $1 and ${sql} returning *`,
        [id, ...params],
      );
      if (!result.rows[0]) throw new Error(`${table}/${id} не найден в области видимости вызывающего`);
      await recordAudit('restore', id, null, null, reason);
      return result.rows[0];
    },
  };

  assertImplements('EntityRepository', repository, `Postgres_${table}_Repository`);
  return repository;
}
