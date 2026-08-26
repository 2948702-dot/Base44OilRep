/**
 * Универсальная реализация EntityRepository поверх Base44.
 *
 * Здесь сосредоточены три вещи, которые нельзя оставлять на усмотрение вызывающего кода:
 * tenant-изоляция, soft delete и запись в журнал аудита.
 */

import { assertImplements } from '../contracts.js';

/** Системные поля Base44, которые никогда не отправляются в payload. */
const FORBIDDEN_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'updated_by'];

/** Сущности, для которых update и delete закрыты по определению (журналы). */
const IMMUTABLE_ENTITIES = new Set(['AuditEvent', 'AgentRun', 'HypothesisRevision']);

/**
 * @param {Object} params
 * @param {Object} params.client клиент Base44
 * @param {string} params.entityName
 * @param {import('../contracts.js').RepositoryScope} params.scope
 * @param {{record: Function}} [params.audit] журнал аудита; отсутствует только у самого журнала
 * @param {boolean} [params.caseScoped]
 * @returns {Object}
 */
export function createEntityRepository({ client, entityName, scope, audit, caseScoped = true }) {
  if (!scope?.organizationId) {
    throw new Error(`Репозиторий ${entityName} создан без organizationId: tenant-изоляция невозможна`);
  }

  const entity = client.entities[entityName];
  if (!entity) {
    throw new Error(`Сущность ${entityName} отсутствует в приложении Base44`);
  }

  const immutable = IMMUTABLE_ENTITIES.has(entityName);

  /** Добавляет обязательные ограничения ко всякому фильтру. */
  function scopedFilter(filter = {}) {
    const scoped = { ...filter, organization_id: scope.organizationId };
    if (caseScoped && scope.caseId && scoped.case_id === undefined) {
      scoped.case_id = scope.caseId;
    }
    return scoped;
  }

  /** Убирает системные поля и не даёт подменить организацию. */
  function sanitize(data) {
    const payload = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      if (FORBIDDEN_FIELDS.includes(key)) continue;
      payload[key] = value === '' || value === undefined ? null : value;
    }
    payload.organization_id = scope.organizationId;
    if (caseScoped && scope.caseId && payload.case_id == null) {
      payload.case_id = scope.caseId;
    }
    return payload;
  }

  async function recordAudit(operation, objectId, oldValue, newValue, reason) {
    if (!audit) return;
    await audit.record({
      organization_id: scope.organizationId,
      case_id: scope.caseId ?? null,
      actor: scope.actorId,
      actor_type: scope.actorType,
      timestamp: new Date().toISOString(),
      object_type: entityName,
      object_id: objectId,
      operation,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      reason: reason ?? scope.reason ?? null,
    });
  }

  /** Проверяет, что найденный объект принадлежит организации вызывающего. */
  function assertOwnership(record) {
    if (!record) return null;
    if (record.organization_id !== scope.organizationId) {
      throw new Error(
        `Отказано: объект ${entityName}/${record.id} принадлежит другой организации`,
      );
    }
    return record;
  }

  const repository = {
    async get(id) {
      const record = await entity.get(id);
      const owned = assertOwnership(record);
      if (!owned || owned.deleted_at) return null;
      return owned;
    },

    /**
     * По умолчанию возвращает только живые записи. Удалённые доступны явным
     * `includeDeleted`, потому что расследование обязано уметь показать, что было удалено.
     */
    async list(filter = {}, options = {}) {
      const { includeDeleted = false, ...rest } = options;
      const records = await entity.filter(scopedFilter(filter), rest.sort, rest.limit);
      const owned = (records ?? []).filter((r) => r.organization_id === scope.organizationId);
      return includeDeleted ? owned : owned.filter((r) => !r.deleted_at);
    },

    async create(data) {
      const payload = sanitize(data);
      const created = await entity.create(payload);
      await recordAudit('create', created.id, null, payload);
      return created;
    },

    async update(id, data) {
      if (immutable) {
        throw new Error(`${entityName} — журнальная сущность: изменение запрещено`);
      }
      const before = await repository.get(id);
      if (!before) throw new Error(`${entityName}/${id} не найден в организации вызывающего`);
      const payload = sanitize(data);
      const updated = await entity.update(id, payload);
      await recordAudit('update', id, before, payload);
      return updated;
    },

    async softDelete(id, reason) {
      if (immutable) {
        throw new Error(`${entityName} — журнальная сущность: удаление запрещено`);
      }
      if (!reason) {
        throw new Error('Soft delete требует причины: она попадает в журнал аудита');
      }
      const before = await repository.get(id);
      if (!before) throw new Error(`${entityName}/${id} не найден в организации вызывающего`);
      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: scope.actorId,
        deletion_reason: reason,
      };
      const updated = await entity.update(id, payload);
      await recordAudit('soft_delete', id, before, payload, reason);
      return updated;
    },

    async restore(id, reason) {
      const record = assertOwnership(await entity.get(id));
      if (!record) throw new Error(`${entityName}/${id} не найден`);
      const payload = { deleted_at: null, deleted_by: null, deletion_reason: null };
      const updated = await entity.update(id, payload);
      await recordAudit('restore', id, record, payload, reason);
      return updated;
    },
  };

  assertImplements('EntityRepository', repository, `Base44${entityName}Repository`);
  return repository;
}
