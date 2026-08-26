/**
 * Контракты слоя хранения.
 *
 * Слои выше Repository (Engine, Agents, Services) не знают, где лежат данные:
 * PostgreSQL на сервере или память в приёмочном прогоне.
 * Любая реализация обязана соблюдать три правила:
 *
 * 1. Каждый запрос ограничен организацией вызывающего; чтение чужого tenant невозможно.
 * 2. Удаление — soft delete; физическое удаление доступно только процедуре удаления
 *    данных tenant.
 * 3. Изменение значимого объекта сопровождается записью в журнал аудита.
 */

/**
 * @typedef {Object} RepositoryScope
 * @property {string} organizationId
 * @property {string} [caseId]
 * @property {string} actorId
 * @property {'user'|'agent'|'system'|'participant'} actorType
 * @property {string} [reason] причина изменения, попадает в журнал аудита
 */

/**
 * @template T
 * @typedef {Object} EntityRepository
 * @property {(id: string) => Promise<T|null>} get
 * @property {(filter?: Record<string, unknown>, options?: {limit?: number, sort?: string}) => Promise<T[]>} list
 * @property {(data: Partial<T>) => Promise<T>} create
 * @property {(id: string, data: Partial<T>) => Promise<T>} update
 * @property {(id: string, reason: string) => Promise<T>} softDelete
 * @property {(id: string, reason: string) => Promise<T>} restore
 */

/**
 * @typedef {Object} FileRepository
 * @property {(file: File|Blob, meta: {filename: string, mimeType: string}) => Promise<{uri: string, sha256: string, byteSize: number}>} upload
 * @property {(uri: string) => Promise<ArrayBuffer>} read
 * @property {(uri: string, expectedSha256: string) => Promise<boolean>} verifyIntegrity
 * @property {(uri: string) => Promise<boolean>} remove удаление оригинала; существует
 *   только ради удаления данных арендатора (§60 ТЗ) и больше нигде не вызывается
 */

/**
 * @typedef {Object} AuditRepository
 * @property {(event: Object) => Promise<Object>} record
 * @property {(filter: Object) => Promise<Object[]>} list
 */

/**
 * Граф расследования. В MVP собирается поверх реляционных связей; интерфейс введён,
 * чтобы позднее заменить реализацию на Neo4j без изменения вызывающего кода (§48, §56 ТЗ).
 *
 * @typedef {Object} GraphRepository
 * @property {(caseId: string) => Promise<{nodes: GraphNode[], edges: GraphEdge[]}>} buildCaseGraph
 * @property {(nodeId: string, options?: {depth?: number, edgeTypes?: string[]}) => Promise<{nodes: GraphNode[], edges: GraphEdge[]}>} neighbourhood
 * @property {(fromId: string, toId: string, options?: {maxDepth?: number}) => Promise<GraphEdge[][]>} paths
 */

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {'Person'|'Claim'|'Event'|'Evidence'|'Document'|'Hypothesis'|'Transaction'|'Organization'|'Location'} type
 * @property {string} label
 * @property {Record<string, unknown>} [attributes]
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} from
 * @property {string} to
 * @property {'MADE_CLAIM'|'SUPPORTS'|'CONTRADICTS'|'PARTICIPATED_IN'|'TRANSFERRED_TO'|'COMMUNICATED_WITH'|'LOCATED_AT'|'RELATES_TO'|'GENERATED'} type
 * @property {Record<string, unknown>} [attributes]
 */

/**
 * Хранилище знаний. Два непересекающихся пространства: методология и материалы дела.
 * Реализация обязана отклонять запрос без organizationId и без space (§49 ТЗ).
 *
 * @typedef {Object} KnowledgeStore
 * @property {(doc: Object) => Promise<Object>} storeDocument
 * @property {(docId: string, embedding: number[]) => Promise<void>} storeEmbedding
 * @property {(query: KnowledgeQuery) => Promise<Object[]>} semanticSearch
 * @property {(query: KnowledgeQuery) => Promise<Object[]>} hybridSearch
 * @property {(organizationId: string) => Promise<{deleted: number}>} deleteTenantData
 */

/**
 * @typedef {Object} KnowledgeQuery
 * @property {string} organizationId
 * @property {'methodology'|'case'} space
 * @property {string} text
 * @property {string} [caseId]
 * @property {number} [limit]
 */

export const GRAPH_NODE_TYPES = [
  'Person',
  'Claim',
  'Event',
  'Evidence',
  'Document',
  'Hypothesis',
  'Transaction',
  'Organization',
  'Location',
];

export const GRAPH_EDGE_TYPES = [
  'MADE_CLAIM',
  'SUPPORTS',
  'CONTRADICTS',
  'PARTICIPATED_IN',
  'TRANSFERRED_TO',
  'COMMUNICATED_WITH',
  'LOCATED_AT',
  'RELATES_TO',
  'GENERATED',
];

const REQUIRED_METHODS = {
  EntityRepository: ['get', 'list', 'create', 'update', 'softDelete', 'restore'],
  FileRepository: ['upload', 'read', 'verifyIntegrity', 'remove'],
  AuditRepository: ['record', 'list'],
  GraphRepository: ['buildCaseGraph', 'neighbourhood', 'paths'],
  KnowledgeStore: ['storeDocument', 'storeEmbedding', 'semanticSearch', 'hybridSearch', 'deleteTenantData'],
};

/**
 * Проверяет, что реализация покрывает контракт. Вызывается в фабриках реализаций,
 * чтобы неполная замена хранилища падала при сборке, а не в середине расследования.
 *
 * @param {keyof typeof REQUIRED_METHODS} contract
 * @param {Object} implementation
 * @param {string} implementationName
 */
export function assertImplements(contract, implementation, implementationName) {
  const required = REQUIRED_METHODS[contract];
  if (!required) throw new Error(`Неизвестный контракт: ${String(contract)}`);
  const missing = required.filter((method) => typeof implementation?.[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(
      `${implementationName} не реализует ${contract}: отсутствуют методы ${missing.join(', ')}`,
    );
  }
}
