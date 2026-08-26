/**
 * Клиент модели.
 *
 * Ключи API остаются на сервере (§60 ТЗ): фронтенд вызывает serverless-функцию, а не
 * провайдера напрямую. Интерфейс одинаков для любого провайдера, чтобы сравнение моделей
 * сводилось к смене строки в AgentContext.model.
 *
 * @typedef {Object} LlmClient
 * @property {(request: LlmRequest) => Promise<LlmResponse>} complete
 */

/**
 * @typedef {Object} LlmRequest
 * @property {string} model
 * @property {string} systemPrompt
 * @property {string} userPrompt
 * @property {number} [maxTokens]
 * @property {number} [temperature]
 * @property {boolean} [jsonOnly]
 */

/**
 * @typedef {Object} LlmResponse
 * @property {string} text
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} [cost]
 * @property {string} model
 */

/**
 * Реализация поверх serverless-функции Base44.
 *
 * @param {{client: Object, functionName?: string}} params
 * @returns {LlmClient}
 */
export function createServerLlmClient({ client, functionName = 'runInvestigationAgent' }) {
  return {
    async complete(request) {
      const response = await client.functions.invoke(functionName, {
        model: request.model,
        system_prompt: request.systemPrompt,
        user_prompt: request.userPrompt,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0,
        json_only: request.jsonOnly !== false,
      });

      const payload = response?.data ?? response;
      if (!payload || payload.error) {
        throw new Error(`Вызов модели не удался: ${payload?.error ?? 'пустой ответ'}`);
      }

      return {
        text: payload.text ?? '',
        inputTokens: payload.input_tokens ?? 0,
        outputTokens: payload.output_tokens ?? 0,
        cost: payload.cost ?? null,
        model: payload.model ?? request.model,
      };
    },
  };
}

/**
 * Клиент для тестов и симулятора: возвращает заранее заданные ответы.
 *
 * @param {Array<string|Object>} responses
 * @returns {LlmClient}
 */
export function createStubLlmClient(responses = []) {
  const queue = [...responses];
  return {
    async complete(request) {
      const next = queue.shift();
      if (next === undefined) {
        throw new Error('Stub-клиент модели исчерпал заготовленные ответы');
      }
      const text = typeof next === 'string' ? next : JSON.stringify(next);
      return {
        text,
        inputTokens: request.userPrompt.length,
        outputTokens: text.length,
        cost: 0,
        model: request.model,
      };
    },
  };
}
