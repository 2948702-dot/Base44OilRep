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
import { createAnalysisService } from './AnalysisService.js';
import { createReportService } from './ReportService.js';

export {
  createApprovalService,
  createSourceService,
  createCaseService,
  createInterviewService,
  createAnalysisService,
  createReportService,
};

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

  const cases = createCaseService({ repositories, scope, llm: llmClient, approvals });

  return {
    repositories,
    approvals,
    sources,
    cases,
    interviews: createInterviewService({ repositories, scope, llm: llmClient, approvals, sources }),
    analysis: createAnalysisService({ repositories, scope, llm: llmClient, approvals }),
    reports: createReportService({ repositories, scope, llm: llmClient, approvals }),
  };
}
