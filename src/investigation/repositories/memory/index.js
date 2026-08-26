/**
 * Реализация слоя хранения в памяти.
 *
 * Нужна для приёмочного прогона и симулятора расследований: методологию нельзя
 * проверять только на живой базе, иначе каждая проверка требует развёрнутого сервера
 * и оставляет за собой мусор.
 *
 * Это не «упрощённая» версия: она обязана соблюдать те же контракты, включая отказ
 * изменять журнальные сущности и обязательную причину при soft delete. Расхождение
 * поведения между памятью и базой означало бы, что приёмка проверяет не то, что работает.
 */

import { assertImplements } from '../contracts.js';
import { SCHEMA } from '../postgres/schema.generated.js';
import { sha256Hex } from '../../domain/hash.js';

const APPEND_ONLY = new Set(['AuditEvent', 'AgentRun', 'HypothesisRevision', 'BenchmarkResult']);

function matches(record, filter) {
  return Object.entries(filter ?? {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (value === null) return record[key] == null;
    if (Array.isArray(value)) return value.includes(record[key]);
    return record[key] === value;
  });
}

export function createMemoryStore() {
  return { tables: new Map(), sequence: 0 };
}

function collection(store, name) {
  if (!store.tables.has(name)) store.tables.set(name, new Map());
  return store.tables.get(name);
}

function createMemoryEntityRepository({ store, entity, scope, audit, caseScoped }) {
  const columnSet = new Set(SCHEMA[entity]?.columns ?? []);
  const appendOnly = APPEND_ONLY.has(entity);
  const records = () => collection(store, entity);

  function sanitize(data, { forCreate = false } = {}) {
    const payload = {};
    for (const [key, value] of Object.entries(data ?? {})) {
      if (columnSet.size > 0 && !columnSet.has(key)) continue;
      payload[key] = value === '' || value === undefined ? null : value;
    }
    payload.organization_id = scope.organizationId;
    if (forCreate && caseScoped && scope.caseId && payload.case_id == null) {
      payload.case_id = scope.caseId;
    }
    if (!forCreate && caseScoped) delete payload.case_id;
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
      object_type: entity,
      object_id: objectId,
      operation,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      reason: reason ?? null,
    });
  }

  /**
   * Строка видна вызывающему, если она принадлежит его организации и, для сущностей
   * внутри дела, его делу. Поведение совпадает с PostgreSQL-драйвером: чужая строка
   * не отличается от несуществующей. Расхождение здесь означало бы, что приёмка
   * проверяет не то, что работает на сервере.
   */
  function visible(record) {
    if (!record) return null;
    if (record.organization_id !== scope.organizationId) return null;
    if (caseScoped && scope.caseId && record.case_id != null && record.case_id !== scope.caseId) {
      return null;
    }
    return record;
  }

  const repository = {
    async get(id) {
      const record = visible(records().get(id));
      if (!record || record.deleted_at) return null;
      return record;
    },

    async list(filter = {}, options = {}) {
      const { includeDeleted = false, limit, sort } = options;
      const scoped = { organization_id: scope.organizationId, ...filter };
      if (caseScoped && scope.caseId && scoped.case_id === undefined) scoped.case_id = scope.caseId;

      let found = [...records().values()].filter((r) => matches(r, scoped));
      if (!includeDeleted) found = found.filter((r) => !r.deleted_at);
      if (sort) {
        const desc = sort.startsWith('-');
        const column = desc ? sort.slice(1) : sort;
        found.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')));
        if (desc) found.reverse();
      }
      return limit ? found.slice(0, limit) : found;
    },

    async create(data) {
      store.sequence += 1;
      const id = `${SCHEMA[entity]?.table ?? entity.toLowerCase()}_${store.sequence}`;
      const record = { ...sanitize(data, { forCreate: true }), id, created_at: new Date().toISOString() };
      records().set(id, record);
      await recordAudit('create', id, null, record);
      return record;
    },

    async update(id, data) {
      if (appendOnly) throw new Error(`${entity} — журнальная сущность: изменение запрещено`);
      const before = await repository.get(id);
      if (!before) throw new Error(`${entity}/${id} не найден в организации вызывающего`);
      const payload = sanitize(data);
      delete payload.organization_id;
      const updated = { ...before, ...payload, id, updated_at: new Date().toISOString() };
      records().set(id, updated);
      await recordAudit('update', id, before, payload);
      return updated;
    },

    async softDelete(id, reason) {
      if (appendOnly) throw new Error(`${entity} — журнальная сущность: удаление запрещено`);
      if (!reason) throw new Error('Soft delete требует причины: она попадает в журнал аудита');
      const before = await repository.get(id);
      if (!before) throw new Error(`${entity}/${id} не найден в организации вызывающего`);
      const updated = {
        ...before,
        deleted_at: new Date().toISOString(),
        deleted_by: scope.actorId,
        deletion_reason: reason,
      };
      records().set(id, updated);
      await recordAudit('soft_delete', id, before, { deletion_reason: reason }, reason);
      return updated;
    },

    async restore(id, reason) {
      const record = visible(records().get(id));
      if (!record) throw new Error(`${entity}/${id} не найден в области видимости вызывающего`);
      const updated = { ...record, deleted_at: null, deleted_by: null, deletion_reason: null };
      records().set(id, updated);
      await recordAudit('restore', id, record, null, reason);
      return updated;
    },
  };

  assertImplements('EntityRepository', repository, `Memory_${entity}_Repository`);
  return repository;
}

function createMemoryAuditRepository({ store, organizationId }) {
  const repository = {
    async record(event) {
      store.sequence += 1;
      const id = `audit_event_${store.sequence}`;
      const record = { ...event, organization_id: organizationId, id };
      collection(store, 'AuditEvent').set(id, record);
      return record;
    },
    async list(filter = {}) {
      return [...collection(store, 'AuditEvent').values()]
        .filter((r) => matches(r, { organization_id: organizationId, ...filter }));
    },
  };
  assertImplements('AuditRepository', repository, 'MemoryAuditRepository');
  return repository;
}

function createMemoryFileRepository({ store }) {
  const blobs = collection(store, '__files');
  const repository = {
    async upload(file) {
      const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      const uri = `memory://${sha256}`;
      if (!blobs.has(uri)) blobs.set(uri, bytes);
      return { uri, sha256, byteSize: bytes.byteLength };
    },
    async read(uri) {
      const bytes = blobs.get(uri);
      if (!bytes) throw new Error(`Файл ${uri} не найден`);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async verifyIntegrity(uri, expectedSha256) {
      return (await sha256Hex(await repository.read(uri))) === expectedSha256;
    },
    async remove(uri) {
      return blobs.delete(uri);
    },
  };
  assertImplements('FileRepository', repository, 'MemoryFileRepository');
  return repository;
}

function createMemoryKnowledgeStore({ store }) {
  const docs = collection(store, 'KnowledgeDocument');
  const SPACES = ['methodology', 'case'];

  function assertRequest(request) {
    if (!request?.organizationId) throw new Error('Запрос к KnowledgeStore без organizationId запрещён');
    if (!SPACES.includes(request.space)) throw new Error('Запрос к KnowledgeStore требует space');
    if (request.space === 'case' && !request.caseId) throw new Error('Поиск в пространстве дела требует caseId');
  }

  const repository = {
    async storeDocument(doc) {
      if (!doc?.organization_id) throw new Error('KnowledgeDocument без organization_id');
      if (!SPACES.includes(doc.space)) throw new Error('KnowledgeDocument без корректного space');
      store.sequence += 1;
      const id = `knowledge_document_${store.sequence}`;
      const record = { ...doc, id };
      docs.set(id, record);
      return record;
    },
    async storeEmbedding(docId, embedding) {
      const doc = docs.get(docId);
      if (doc) docs.set(docId, { ...doc, embedding_ref: `dim:${embedding.length}` });
    },
    async semanticSearch(request) {
      assertRequest(request);
      const terms = String(request.text ?? '').toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
      return [...docs.values()]
        .filter((d) => d.organization_id === request.organizationId && d.space === request.space)
        .filter((d) => !request.caseId || d.case_id === request.caseId)
        .map((d) => ({
          ...d,
          relevance_score: terms.filter((t) => `${d.title} ${d.content}`.toLowerCase().includes(t)).length,
          retrieval_mode: 'lexical_memory',
        }))
        .filter((d) => d.relevance_score > 0)
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, request.limit ?? 10);
    },
    async hybridSearch(request) {
      return repository.semanticSearch(request);
    },
    async deleteTenantData(organizationId) {
      let deleted = 0;
      for (const [id, doc] of docs) {
        if (doc.organization_id === organizationId) { docs.delete(id); deleted += 1; }
      }
      return { deleted };
    },
  };
  assertImplements('KnowledgeStore', repository, 'MemoryKnowledgeStore');
  return repository;
}

export const memoryDriver = {
  createEntityRepository: createMemoryEntityRepository,
  createAuditRepository: createMemoryAuditRepository,
  createFileRepository: createMemoryFileRepository,
  createKnowledgeStore: createMemoryKnowledgeStore,
};
