/**
 * Реестр агентов расследования.
 *
 * Порядок в списке повторяет цикл расследования §67 ТЗ: приём заявления, планирование,
 * подготовка и проведение интервью, извлечение утверждений, хронология, противоречия,
 * пересмотр версий, независимая проверка, планирование следующего раунда,
 * классификация выводов и оформление итогового отчёта.
 *
 * Полный состав из 18 ролей описан в src/docs/investigation/agent-catalog.md.
 * Недостающие агенты реализуются поверх готового framework и не требуют его изменения.
 */

import { createAgent } from './framework/AgentRunner.js';
import { caseManagerAgent } from './definitions/caseManager.js';
import { intakeAnalystAgent } from './definitions/intakeAnalyst.js';
import { investigationPlannerAgent } from './definitions/investigationPlanner.js';
import { claimExtractorAgent } from './definitions/claimExtractor.js';
import { documentAnalystAgent } from './definitions/documentAnalyst.js';
import { redTeamInvestigatorAgent } from './definitions/redTeamInvestigator.js';
import { interviewStrategistAgent } from './definitions/interviewStrategist.js';
import { aiInterviewerAgent } from './definitions/aiInterviewer.js';
import { timelineAnalystAgent } from './definitions/timelineAnalyst.js';
import { contradictionAnalystAgent } from './definitions/contradictionAnalyst.js';
import { hypothesisAnalystAgent } from './definitions/hypothesisAnalyst.js';
import { followUpPlannerAgent } from './definitions/followUpPlanner.js';
import { corroborationAgent } from './definitions/corroborationAgent.js';
import { financialInvestigatorAgent } from './definitions/financialInvestigator.js';
import { defenceReviewerAgent } from './definitions/defenceReviewer.js';
import { rootCauseAnalystAgent } from './definitions/rootCauseAnalyst.js';
import { finalReviewerAgent } from './definitions/finalReviewer.js';
import { reportWriterAgent } from './definitions/reportWriter.js';
import { caseDirectorAgent } from './definitions/caseDirector.js';

const DEFINITIONS = [
  caseManagerAgent,
  intakeAnalystAgent,
  investigationPlannerAgent,
  documentAnalystAgent,
  interviewStrategistAgent,
  aiInterviewerAgent,
  claimExtractorAgent,
  timelineAnalystAgent,
  contradictionAnalystAgent,
  corroborationAgent,
  financialInvestigatorAgent,
  hypothesisAnalystAgent,
  redTeamInvestigatorAgent,
  defenceReviewerAgent,
  followUpPlannerAgent,
  rootCauseAnalystAgent,
  finalReviewerAgent,
  reportWriterAgent,
  // Агент симулятора: в производственном расследовании не участвует и вызывается
  // только прогоном учебного дела.
  caseDirectorAgent,
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
