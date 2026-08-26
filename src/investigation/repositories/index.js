/**
 * Единая точка сборки слоя хранения.
 *
 * Вызывающий код получает набор репозиториев, а не клиент Base44. Ни один слой выше
 * не импортирует SDK напрямую — это условие замены хранилища без переписывания
 * методологии расследования (§78, §79 ТЗ).
 */

import { createEntityRepository } from './base44/createEntityRepository.js';
import { createAuditRepository } from './base44/createAuditRepository.js';
import { createFileRepository } from './base44/createFileRepository.js';
import { createRelationalGraphRepository } from './graph/RelationalGraphRepository.js';
import { createBase44KnowledgeStore } from './knowledge/Base44KnowledgeStore.js';

export * from './contracts.js';

/** Соответствие имён репозиториев именам сущностей Base44. */
const ENTITY_MAP = {
  organizations: { entity: 'Organization', caseScoped: false },
  users: { entity: 'User', caseScoped: false },
  cases: { entity: 'InvestigationCase', caseScoped: false },
  persons: { entity: 'Person' },
  allegations: { entity: 'Allegation' },
  issues: { entity: 'Issue' },
  hypotheses: { entity: 'Hypothesis' },
  hypothesisRevisions: { entity: 'HypothesisRevision' },
  sources: { entity: 'Source' },
  evidence: { entity: 'Evidence' },
  claims: { entity: 'Claim' },
  claimEvidenceLinks: { entity: 'ClaimEvidenceLink' },
  events: { entity: 'InvestigationEvent' },
  contradictions: { entity: 'Contradiction' },
  interviews: { entity: 'Interview' },
  questions: { entity: 'InterviewQuestion' },
  answers: { entity: 'InterviewAnswer' },
  accessTokens: { entity: 'InterviewAccessToken' },
  transactions: { entity: 'MoneyTransaction' },
  moneyFlowEdges: { entity: 'MoneyFlowEdge' },
  findings: { entity: 'Finding' },
  tasks: { entity: 'InvestigationTask' },
  approvals: { entity: 'ApprovalRequest' },
  agentRuns: { entity: 'AgentRun' },
  jobs: { entity: 'InvestigationJob' },
  trainingCases: { entity: 'TrainingCase', caseScoped: false },
};

/**
 * @param {Object} params
 * @param {Object} params.client клиент Base44
 * @param {import('./contracts.js').RepositoryScope} params.scope
 * @returns {Object}
 */
export function createRepositories({ client, scope }) {
  const audit = createAuditRepository({ client, organizationId: scope.organizationId });

  const repositories = { audit };
  for (const [key, config] of Object.entries(ENTITY_MAP)) {
    repositories[key] = createEntityRepository({
      client,
      entityName: config.entity,
      scope,
      audit,
      caseScoped: config.caseScoped !== false,
    });
  }

  repositories.files = createFileRepository({ client });
  repositories.knowledge = createBase44KnowledgeStore({ client });
  repositories.graph = createRelationalGraphRepository({ repositories });

  return repositories;
}
