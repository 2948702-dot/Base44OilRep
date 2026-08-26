/**
 * Клиент модели.
 *
 * Вызов провайдера выполняется только на сервере: ключ никогда не попадает в браузер
 * и не передаётся клиенту (§60 ТЗ). Фронтенд обращается к собственному API платформы,
 * а не к Anthropic напрямую.
 *
 * Интерфейс одинаков для любого провайдера: сравнение моделей должно сводиться к смене
 * строки в AgentContext.model, иначе бенчмарк агентов (§52 ТЗ) невозможно провести честно.
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
 * Модели, допустимые для агентов расследования, и их стоимость за миллион токенов.
 * Белый список нужен не для экономии: он не даёт одной опечатке в конфигурации
 * незаметно поменять модель, на которой построены уже выпущенные выводы.
 */
export const ALLOWED_MODELS = {
  'claude-opus-5': { id: 'claude-opus-5', inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-5': { id: 'claude-sonnet-5', inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5': { id: 'claude-haiku-4-5-20251001', inputPerMTok: 1, outputPerMTok: 5 },
};

const MAX_PROMPT_CHARS = 400_000;

/**
 * @param {{apiKey?: string, client?: Object}} [options]
 * @returns {LlmClient}
 */
export function createAnthropicLlmClient(options = {}) {
  let clientPromise = null;

  async function getClient() {
    if (options.client) return options.client;
    if (!clientPromise) {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY не задан: запуск агентов невозможен');
      clientPromise = import('@anthropic-ai/sdk').then((module) => new module.default({ apiKey }));
    }
    return clientPromise;
  }

  return {
    async complete(request) {
      const config = ALLOWED_MODELS[request.model];
      if (!config) {
        throw new Error(
          `Модель ${request.model} не разрешена. Допустимы: ${Object.keys(ALLOWED_MODELS).join(', ')}`,
        );
      }
      if (request.systemPrompt.length + request.userPrompt.length > MAX_PROMPT_CHARS) {
        throw new Error('Промпт превышает предельный размер: вероятна ошибка сборки контекста');
      }

      const client = await getClient();
      const response = await client.messages.create({
        model: config.id,
        max_tokens: request.maxTokens ?? 8192,
        temperature: request.temperature ?? 0,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
      });

      const text = (response.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      return {
        text,
        inputTokens,
        outputTokens,
        cost: (inputTokens * config.inputPerMTok + outputTokens * config.outputPerMTok) / 1_000_000,
        model: response.model ?? config.id,
        stopReason: response.stop_reason ?? null,
      };
    },
  };
}

/**
 * Клиент для приёмочного прогона и симулятора: возвращает заранее заданные ответы.
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
