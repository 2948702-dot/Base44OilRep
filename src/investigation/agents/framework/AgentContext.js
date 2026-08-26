/**
 * Контекст запуска агента (§77 ТЗ).
 *
 * Контекст определяет не только «где мы», но и «что агенту разрешено видеть». Ограничение
 * данных реализуется здесь, а не просьбой в промпте: агент, которому нельзя видеть
 * рассуждения Hypothesis Analyst, физически их не получает.
 */

/**
 * @typedef {Object} AgentContext
 * @property {string} caseId
 * @property {string} organizationId
 * @property {string} actorId
 * @property {'user'|'agent'|'system'} actorType
 * @property {string} model
 * @property {string} methodologyVersion
 * @property {string[]} allowedSources идентификаторы источников, доступных агенту
 * @property {string[]} allowedEntityTypes типы сущностей, доступные агенту
 * @property {Object} repositories слой хранения
 * @property {Object} llm клиент модели
 * @property {string} [jobId]
 * @property {string} [triggeredBy]
 */

export const METHODOLOGY_VERSION = '2026.08.1';

/**
 * @param {Partial<AgentContext>} input
 * @returns {AgentContext}
 */
export function createAgentContext(input) {
  const required = ['caseId', 'organizationId', 'actorId', 'repositories', 'llm'];
  const missing = required.filter((key) => !input?.[key]);
  if (missing.length > 0) {
    throw new Error(`AgentContext создан без обязательных полей: ${missing.join(', ')}`);
  }

  return {
    caseId: input.caseId,
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorType: input.actorType ?? 'user',
    model: input.model ?? 'claude-opus-5',
    methodologyVersion: input.methodologyVersion ?? METHODOLOGY_VERSION,
    allowedSources: input.allowedSources ?? [],
    allowedEntityTypes: input.allowedEntityTypes ?? [],
    repositories: input.repositories,
    llm: input.llm,
    jobId: input.jobId,
    triggeredBy: input.triggeredBy ?? input.actorId,
  };
}

/**
 * Проверяет, что агент вправе прочитать сущность этого типа.
 *
 * @param {AgentContext} context
 * @param {string} entityType
 * @param {string} agentId
 */
export function assertEntityAllowed(context, entityType, agentId) {
  if (context.allowedEntityTypes.length === 0) return;
  if (!context.allowedEntityTypes.includes(entityType)) {
    throw new Error(
      `Агент ${agentId} не имеет доступа к ${entityType}: тип не входит в allowedEntityTypes`,
    );
  }
}

/**
 * @param {AgentContext} context
 * @param {string} sourceId
 * @param {string} agentId
 */
export function assertSourceAllowed(context, sourceId, agentId) {
  if (context.allowedSources.length === 0) return;
  if (!context.allowedSources.includes(sourceId)) {
    throw new Error(`Агент ${agentId} не имеет доступа к источнику ${sourceId}`);
  }
}
