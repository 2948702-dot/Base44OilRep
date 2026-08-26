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
import { createSimulatorService } from './SimulatorService.js';

export {
  createApprovalService,
  createSourceService,
  createCaseService,
  createInterviewService,
  createAnalysisService,
  createReportService,
  createSimulatorService,
};

/**
 * @param {Object} params
 * @param {import('../repositories/contracts.js').RepositoryScope} params.scope
 * @param {Object} [params.pool] пул PostgreSQL
 * @param {Object} [params.store] хранилище в памяти для приёмки и симулятора
 * @param {'postgres'|'memory'} [params.driver]
 * @param {Object} [params.llm] клиент модели; по умолчанию — Anthropic на сервере
 * @param {string} [params.fileRoot]
 * @param {Function} [params.extractDocument] извлечение текста из материалов
 * @returns {Object}
 */
export function createInvestigationServices({
  scope, pool, store, driver, llm, fileRoot, extractDocument: extractDocumentImpl,
}) {
  const repositories = createRepositories({ scope, pool, store, driver, fileRoot });
  const llmClient = llm ?? createAnthropicLlmClient();
  const approvals = createApprovalService({ repositories, scope });
  const sources = createSourceService({
    repositories,
    scope,
    llm: llmClient,
    extractDocument: extractDocumentImpl,
  });

  const cases = createCaseService({ repositories, scope, llm: llmClient, approvals });

  const bundle = {
    repositories,
    approvals,
    sources,
    cases,
    interviews: createInterviewService({ repositories, scope, llm: llmClient, approvals, sources }),
    analysis: createAnalysisService({ repositories, scope, llm: llmClient, approvals }),
    reports: createReportService({ repositories, scope, llm: llmClient, approvals }),
  };

  // Симулятор строит сервисы в области видимости учебного дела тем же вызовом, что и
  // всё остальное приложение: прогон обязан идти по тому же коду, что и настоящее
  // расследование, иначе он измеряет не то, что мы поставляем.
  bundle.simulator = createSimulatorService({
    repositories,
    scope,
    llm: llmClient,
    services: bundle,
    makeCaseServices: (caseId) => createInvestigationServices({
      scope: { ...scope, caseId },
      pool,
      store,
      driver,
      llm: llmClient,
      fileRoot,
      extractDocument: extractDocumentImpl,
    }),
  });

  return bundle;
}
