/**
 * Сборка слоя хранения.
 *
 * Вызывающий код получает набор репозиториев и не знает, что под ними: PostgreSQL
 * на сервере или память в приёмочном прогоне. Это условие §78 ТЗ и единственный способ
 * проверять методологию расследования без развёрнутой инфраструктуры.
 */

import { createEntityRepository as createPgEntityRepository } from './postgres/createEntityRepository.js';
import { createAuditRepository as createPgAuditRepository } from './postgres/createAuditRepository.js';
import { createFileRepository as createDiskFileRepository } from './postgres/createFileRepository.js';
import { createPostgresKnowledgeStore } from './knowledge/PostgresKnowledgeStore.js';
import { createRelationalGraphRepository } from './graph/RelationalGraphRepository.js';
import { memoryDriver, createMemoryStore } from './memory/index.js';
import { SCHEMA } from './postgres/schema.generated.js';

export * from './contracts.js';
export { createPool, withTenant, inTransaction } from './postgres/pool.js';
export { createMemoryStore };

/** Имена репозиториев и стоящие за ними сущности домена. */
const REPOSITORY_MAP = {
  organizations: 'Organization',
  users: 'User',
  cases: 'InvestigationCase',
  persons: 'Person',
  allegations: 'Allegation',
  issues: 'Issue',
  hypotheses: 'Hypothesis',
  hypothesisRevisions: 'HypothesisRevision',
  sources: 'Source',
  evidence: 'Evidence',
  claims: 'Claim',
  claimEvidenceLinks: 'ClaimEvidenceLink',
  events: 'InvestigationEvent',
  contradictions: 'Contradiction',
  interviews: 'Interview',
  questions: 'InterviewQuestion',
  answers: 'InterviewAnswer',
  accessTokens: 'InterviewAccessToken',
  transactions: 'MoneyTransaction',
  moneyFlowEdges: 'MoneyFlowEdge',
  findings: 'Finding',
  reports: 'InvestigationReport',
  tasks: 'InvestigationTask',
  approvals: 'ApprovalRequest',
  agentRuns: 'AgentRun',
  jobs: 'InvestigationJob',
  trainingCases: 'TrainingCase',
};

const postgresDriver = {
  createEntityRepository: ({ db, entity, scope, audit, caseScoped }) => createPgEntityRepository({
    db,
    table: SCHEMA[entity].table,
    columns: SCHEMA[entity].columns,
    jsonColumns: SCHEMA[entity].jsonColumns,
    scope,
    audit,
    caseScoped,
  }),
  createAuditRepository: ({ db, organizationId }) => createPgAuditRepository({ db, organizationId }),
  createFileRepository: ({ fileRoot }) => createDiskFileRepository({ root: fileRoot }),
  createKnowledgeStore: ({ db, embed }) => createPostgresKnowledgeStore({ db, embed }),
};

/**
 * @param {Object} params
 * @param {import('./contracts.js').RepositoryScope} params.scope
 * @param {Object} [params.pool] пул PostgreSQL; обязателен для драйвера postgres
 * @param {Object} [params.store] хранилище в памяти; обязательно для драйвера memory
 * @param {'postgres'|'memory'} [params.driver]
 * @param {(text: string) => Promise<number[]>} [params.embed]
 * @param {string} [params.fileRoot]
 * @returns {Object}
 */
export function createRepositories({ scope, pool, store, driver, embed, fileRoot }) {
  const kind = driver ?? (pool ? 'postgres' : 'memory');
  const impl = kind === 'postgres' ? postgresDriver : memoryDriver;

  if (kind === 'postgres' && !pool) throw new Error('Драйвер postgres требует пул соединений');
  const memoryStore = kind === 'memory' ? (store ?? createMemoryStore()) : null;
  const db = kind === 'postgres' ? { pool, scope } : null;

  const context = { db, store: memoryStore };

  const audit = impl.createAuditRepository({ ...context, organizationId: scope.organizationId });
  const repositories = { audit, driver: kind, db, store: memoryStore };

  for (const [key, entity] of Object.entries(REPOSITORY_MAP)) {
    repositories[key] = impl.createEntityRepository({
      ...context,
      entity,
      scope,
      audit,
      caseScoped: SCHEMA[entity].caseScoped,
    });
  }

  repositories.files = impl.createFileRepository({ ...context, fileRoot });
  repositories.knowledge = impl.createKnowledgeStore({ ...context, embed });
  repositories.graph = createRelationalGraphRepository({ repositories });

  return repositories;
}
