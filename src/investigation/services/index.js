/**
 * Сборка прикладного слоя.
 *
 * Единственная точка, где соединяются хранилище, модель и сервисы. UI получает готовый
 * набор сервисов и не конструирует зависимости сам.
 */

import { createRepositories } from '../repositories/index.js';
import { createServerLlmClient } from '../agents/framework/llmClient.js';
import { createApprovalService } from './ApprovalService.js';
import { createSourceService } from './SourceService.js';
import { createCaseService } from './CaseService.js';
import { createInterviewService } from './InterviewService.js';

export { createApprovalService, createSourceService, createCaseService, createInterviewService };

/**
 * @param {Object} params
 * @param {Object} params.client клиент Base44
 * @param {import('../repositories/contracts.js').RepositoryScope} params.scope
 * @param {Object} [params.llm] клиент модели; по умолчанию — вызов serverless-функции
 * @returns {Object}
 */
export function createInvestigationServices({ client, scope, llm }) {
  const repositories = createRepositories({ client, scope });
  const llmClient = llm ?? createServerLlmClient({ client });
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
