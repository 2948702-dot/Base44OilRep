/**
 * Исполнитель агентов.
 *
 * Отвечает за то, что нельзя доверять ни модели, ни автору промпта:
 *
 * - агент получает только разрешённые ему данные;
 * - ответ обязан пройти JSON-схему, иначе запуск считается неуспешным, а не «почти верным»;
 * - каждый запуск попадает в AgentRun с моделью, версией промпта и стоимостью,
 *   иначе Finding не воспроизводим (§41, §62, §70 ТЗ).
 *
 * AgentRun пишется один раз, по завершении: сущность запрещена к изменению. Состояние
 * незавершённого выполнения живёт в InvestigationJob.
 */

import { buildPromptEnvelope } from './promptEnvelope.js';
import { UNIVERSAL_FORBIDDEN_ACTIONS } from './defineAgent.js';

const SCHEMA_RETRY_LIMIT = 1;

/**
 * Достаёт JSON из ответа модели. Допускается обёртка в markdown-блок, но не пояснения
 * вместо объекта: prose вместо JSON — это неуспешный запуск.
 *
 * @param {string} text
 * @returns {Object}
 */
export function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1].trim() : raw;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Ответ агента не содержит объекта JSON');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function buildInstructions(definition, context) {
  const forbidden = [...UNIVERSAL_FORBIDDEN_ACTIONS, ...definition.forbiddenActions];
  return [
    `Роль: ${definition.title}.`,
    definition.role.trim(),
    '',
    'Запрещено:',
    ...forbidden.map((item) => `- ${item}`),
    '',
    `Версия методологии: ${context.methodologyVersion}.`,
    'Если данных недостаточно для вывода, это фиксируется как неизвестность, а не достраивается.',
  ].join('\n');
}

/**
 * @param {Object} params
 * @param {import('./defineAgent.js').AgentDefinition} params.definition
 * @param {Object} params.input
 * @param {import('./AgentContext.js').AgentContext} params.context
 * @returns {Promise<{output: Object, run: Object, injectionMarkers: string[]}>}
 */
export async function runAgent({ definition, input, context }) {
  const startedAt = new Date().toISOString();
  const gathered = await definition.gatherContext(input, context);
  const promptParts = definition.buildPrompt(input, gathered, context);

  const envelope = buildPromptEnvelope({
    instructions: buildInstructions(definition, context),
    methodology: promptParts.methodology,
    caseData: promptParts.caseData,
    userData: promptParts.userData,
    documents: promptParts.documents,
    outputContract: definition.outputContract,
  });

  let attempt = 0;
  let lastError = null;
  let response = null;
  let parsed = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  while (attempt <= SCHEMA_RETRY_LIMIT) {
    const userPrompt = attempt === 0
      ? envelope.prompt
      : `${envelope.prompt}\n\n### PREVIOUS ATTEMPT REJECTED\n${lastError}\nВерни только корректный JSON по схеме.`;

    response = await context.llm.complete({
      model: context.model,
      systemPrompt: buildInstructions(definition, context),
      userPrompt,
      jsonOnly: true,
    });

    totalInputTokens += response.inputTokens ?? 0;
    totalOutputTokens += response.outputTokens ?? 0;
    totalCost += response.cost ?? 0;

    try {
      const candidate = extractJson(response.text);
      parsed = definition.outputSchema.parse(candidate);
      break;
    } catch (error) {
      lastError = error?.message ?? String(error);
      parsed = null;
      attempt += 1;
    }
  }

  const finishedAt = new Date().toISOString();
  const status = parsed ? 'completed' : 'rejected_schema';

  const run = await context.repositories.agentRuns.create({
    organization_id: context.organizationId,
    case_id: context.caseId,
    agent_type: definition.id,
    agent_version: definition.version,
    prompt_version: definition.promptVersion,
    model: response?.model ?? context.model,
    input_object_ids: gathered.inputObjectIds ?? input?.objectIds ?? [],
    input_digest: promptParts.inputDigest ?? null,
    output: parsed ?? { raw_text: response?.text ?? null },
    output_schema_version: definition.promptVersion,
    started_at: startedAt,
    finished_at: finishedAt,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost: totalCost,
    status,
    error: parsed ? null : lastError,
    triggered_by: context.triggeredBy,
    job_id: context.jobId ?? null,
  });

  if (!parsed) {
    throw new Error(
      `Агент ${definition.id} вернул ответ, не прошедший схему (${run.id}): ${lastError}`,
    );
  }

  return { output: parsed, run, injectionMarkers: envelope.injectionMarkers };
}

/**
 * Оборачивает определение агента в объект с методом run, соответствующий
 * interface InvestigationAgent<I, O> из §77 ТЗ.
 *
 * @param {import('./defineAgent.js').AgentDefinition} definition
 */
export function createAgent(definition) {
  return {
    id: definition.id,
    version: definition.version,
    definition,
    async run(input, context) {
      const { output } = await runAgent({ definition, input, context });
      return output;
    },
    async runWithMetadata(input, context) {
      return runAgent({ definition, input, context });
    },
  };
}
