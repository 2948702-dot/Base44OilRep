/**
 * Реестр агентов расследования.
 *
 * Реализованные агенты регистрируются здесь; полный состав из 18 ролей описан в
 * src/docs/investigation/agent-catalog.md. Реализация недостающих агентов идёт поверх
 * готового framework и не требует его изменения (§76 ТЗ).
 */

import { createAgent } from './framework/AgentRunner.js';
import { caseManagerAgent } from './definitions/caseManager.js';
import { intakeAnalystAgent } from './definitions/intakeAnalyst.js';
import { investigationPlannerAgent } from './definitions/investigationPlanner.js';
import { claimExtractorAgent } from './definitions/claimExtractor.js';
import { redTeamInvestigatorAgent } from './definitions/redTeamInvestigator.js';

const DEFINITIONS = [
  caseManagerAgent,
  intakeAnalystAgent,
  investigationPlannerAgent,
  claimExtractorAgent,
  redTeamInvestigatorAgent,
];

const REGISTRY = new Map(DEFINITIONS.map((definition) => [definition.id, createAgent(definition)]));

/**
 * @param {string} agentId
 * @returns {Object}
 */
export function getAgent(agentId) {
  const agent = REGISTRY.get(agentId);
  if (!agent) {
    throw new Error(
      `Агент ${agentId} не реализован. Реализованные: ${[...REGISTRY.keys()].join(', ')}`,
    );
  }
  return agent;
}

/**
 * @returns {string[]}
 */
export function listAgents() {
  return [...REGISTRY.keys()];
}

export { REGISTRY as AGENT_REGISTRY };
