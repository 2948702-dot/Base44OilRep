/**
 * Сборка прикладного слоя.
 *
 * Единственная точка, где соединяются хранилище, модель и сервисы. UI и HTTP-слой
 * получают готовый набор сервисов и не конструируют зависимости сами.
 */

import { createRepositories } from '../repositories/index.js';
import { createAnthropicLlmClient } from '../agents/framework/llmClient.js';
import { createApprovalService } from './ApprovalService.js';
import { createSourceService } from './SourceService.js';
import { createCaseService } from './CaseService.js';
import { createInterviewService } from './InterviewService.js';

export { createApprovalService, createSourceService, createCaseService, createInterviewService };

/**
 * @param {Object} params
 * @param {import('../repositories/contracts.js').RepositoryScope} params.scope
 * @param {Object} [params.pool] пул PostgreSQL
 * @param {Object} [params.store] хранилище в памяти для приёмки и симулятора
 * @param {'postgres'|'memory'} [params.driver]
 * @param {Object} [params.llm] клиент модели; по умолчанию — Anthropic на сервере
 * @param {string} [params.fileRoot]
 * @returns {Object}
 */
export function createInvestigationServices({ scope, pool, store, driver, llm, fileRoot }) {
  const repositories = createRepositories({ scope, pool, store, driver, fileRoot });
  const llmClient = llm ?? createAnthropicLlmClient();
  const approvals = createApprovalService({ repositories, scope });
  const sources = createSourceService({ repositories, scope });

  return {
    repositories,
    approvals,
    sources,
    cases: createCaseService({ repositories, scope, llm: llmClient, approvals }),
    interviews: createInterviewService({ repositories, scope, llm: llmClient, approvals, sources }),
  };
}
