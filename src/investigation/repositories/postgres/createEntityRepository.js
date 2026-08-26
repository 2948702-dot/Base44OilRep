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
const APPEND_ONLY = new Set(['audit_event', 'agent_run', 'hypothesis_revision']);

/**
 * @param {Object} params
 * @param {Object} params.db
 * @param {string} params.table
 * @param {string[]} params.columns колонки таблицы, известные из схемы
 * @param {import('../contracts.js').RepositoryScope} params.scope
 * @param {{record: Function}} [params.audit]
 * @param {boolean} [params.caseScoped]
 */
export function createEntityRepository({ db, table, columns, scope, audit, caseScoped = true }) {
  if (!scope?.organizationId) {
    throw new Error(`Репозиторий ${table} создан без organizationId`);
  }

  const columnSet = new Set(columns);
  const appendOnly = APPEND_ONLY.has(table);

  /** Оставляет только известные схеме колонки и не даёт подменить организацию. */
  function sanitize(data) {
    const payload = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      if (SYSTEM_COLUMNS.has(key)) continue;
      if (!columnSet.has(key)) continue;
      payload[key] = value === '' || value === undefined ? null : value;
    }
    payload.organization_id = scope.organizationId;
    if (caseScoped && scope.caseId && payload.case_id == null) {
      payload.case_id = scope.caseId;
    }
    return payload;
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
      const result = await query(
        db,
        `select * from ${table} where id = $1 and deleted_at is null`,
        [id],
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
      const payload = sanitize(data);
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
      const result = await query(
        db,
        `update ${table} set deleted_at = null, deleted_by = null, deletion_reason = null
         where id = $1 returning *`,
        [id],
      );
      if (!result.rows[0]) throw new Error(`${table}/${id} не найден`);
      await recordAudit('restore', id, null, null, reason);
      return result.rows[0];
    },
  };

  assertImplements('EntityRepository', repository, `Postgres_${table}_Repository`);
  return repository;
}
