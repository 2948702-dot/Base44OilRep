import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Единственная точка вызова внешней модели.
 *
 * Ключи провайдеров остаются на сервере (§60 ТЗ): фронтенд никогда не обращается к
 * Anthropic или OpenAI напрямую. Функция намеренно не знает ничего о методологии
 * расследования — она принимает готовый промпт и возвращает текст с расходом токенов.
 * Вся сборка промпта и валидация схемы выполняются в Agent Layer приложения.
 *
 * Ограничения:
 *   - вызывать может только аутентифицированный пользователь организации;
 *   - размер промпта ограничен, чтобы одна ошибка сборки не съела бюджет;
 *   - выбор модели ограничен списком разрешённых.
 */

const ALLOWED_MODELS: Record<string, { provider: 'anthropic' | 'openai'; id: string }> = {
  'claude-opus-5': { provider: 'anthropic', id: 'claude-opus-5' },
  'claude-sonnet-5': { provider: 'anthropic', id: 'claude-sonnet-5' },
  'claude-haiku-4-5': { provider: 'anthropic', id: 'claude-haiku-4-5-20251001' },
};

const MAX_PROMPT_CHARS = 400_000;

const ROLES_ALLOWED_TO_RUN_AGENTS = [
  'system_admin',
  'org_owner',
  'investigation_manager',
  'investigator',
];

interface AgentRequestBody {
  model?: string;
  system_prompt?: string;
  user_prompt?: string;
  max_tokens?: number;
  temperature?: number;
  json_only?: boolean;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!ROLES_ALLOWED_TO_RUN_AGENTS.includes(user.role)) {
      return Response.json({ error: 'Forbidden: role cannot run agents' }, { status: 403 });
    }

    const body = (await req.json()) as AgentRequestBody;
    const { model, system_prompt: systemPrompt, user_prompt: userPrompt } = body;

    if (!model || !systemPrompt || !userPrompt) {
      return Response.json(
        { error: 'model, system_prompt and user_prompt are required' },
        { status: 400 },
      );
    }

    const modelConfig = ALLOWED_MODELS[model];
    if (!modelConfig) {
      return Response.json(
        { error: `Model ${model} is not allowed`, allowed: Object.keys(ALLOWED_MODELS) },
        { status: 400 },
      );
    }

    if (systemPrompt.length + userPrompt.length > MAX_PROMPT_CHARS) {
      return Response.json({ error: 'Prompt exceeds size limit' }, { status: 413 });
    }

    if (modelConfig.provider !== 'anthropic') {
      return Response.json({ error: 'Only Anthropic provider is wired in MVP' }, { status: 501 });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelConfig.id,
        max_tokens: body.max_tokens ?? 4096,
        temperature: body.temperature ?? 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return Response.json(
        { error: `Model call failed: HTTP ${response.status}`, detail: detail.slice(0, 2000) },
        { status: 502 },
      );
    }

    const payload = await response.json();
    const text = (payload.content ?? [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('\n');

    return Response.json({
      text,
      model: payload.model ?? modelConfig.id,
      input_tokens: payload.usage?.input_tokens ?? 0,
      output_tokens: payload.usage?.output_tokens ?? 0,
      stop_reason: payload.stop_reason ?? null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
