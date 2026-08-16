import Anthropic from '@anthropic-ai/sdk';
import { STATUSES, STATUS_LABELS, localDate } from './agreements.js';
import { PROJECT_CONTEXT } from './project-context.js';
import { logger } from './logger.js';

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    new_agreements: {
      type: 'array',
      description: 'Договорённости, которых ещё нет в реестре',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Что именно обещано, одной фразой' },
          owner_side: {
            type: 'string',
            enum: ['bobr', 'us', 'unclear'],
            description: 'Кто обязан выполнить: сторона BOBR или наша команда',
          },
          assignee: { type: 'string', description: 'Имя ответственного или пустая строка' },
          due: { type: 'string', description: 'Срок в формате ГГГГ-ММ-ДД или пустая строка' },
          status: { type: 'string', enum: STATUSES },
          evidence: { type: 'string', description: 'Цитата из чата, подтверждающая договорённость' },
          message_id: { type: 'integer', description: 'id сообщения-источника, 0 если неизвестно' },
          confidence: { type: 'number', description: 'Уверенность от 0 до 1' },
        },
        required: ['title', 'owner_side', 'assignee', 'due', 'status', 'evidence', 'message_id', 'confidence'],
        additionalProperties: false,
      },
    },
    status_changes: {
      type: 'array',
      description: 'Смены статуса у договорённостей, уже присутствующих в реестре',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'id договорённости из реестра' },
          new_status: { type: 'string', enum: STATUSES },
          due: { type: 'string', description: 'Новый срок ГГГГ-ММ-ДД, если его перенесли; иначе пустая строка' },
          evidence: { type: 'string', description: 'Цитата из чата, подтверждающая смену статуса' },
          message_id: { type: 'integer', description: 'id сообщения-источника, 0 если неизвестно' },
          confidence: { type: 'number', description: 'Уверенность от 0 до 1' },
        },
        required: ['id', 'new_status', 'due', 'evidence', 'message_id', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['new_agreements', 'status_changes'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Ты — аналитик проектного чата по внедрению сервиса BOBR AI.
В чате общаются сотрудники подрядчика BOBR и наша команда. Твоя задача — вести реестр договорённостей и отслеживать смену их статусов.

${PROJECT_CONTEXT}

Договорённость — это конкретное обязательство одной из сторон: что-то настроить, прислать, интегрировать, проверить, ответить, выставить счёт, назначить встречу.
Не считай договорённостью: вопросы без ответа, обсуждение вариантов, приветствия, общие рассуждения, обещания «подумать».

Статусы:
${STATUSES.map((s) => `- ${s} — ${STATUS_LABELS[s]}`).join('\n')}

Правила:
- Новую договорённость заводи только если её нет в реестре. Одна и та же договорённость, переформулированная другими словами, — не новая.
- Смену статуса фиксируй только при явном сигнале в сообщениях: «сделали», «настроили», «выложили», «переносим на пятницу», «отменяем».
- В evidence давай короткую дословную цитату из сообщения, а не пересказ.
- Срок ставь только если он назван или однозначно вычисляется от даты сообщения. Иначе оставляй пустую строку.
- confidence ниже 0.6 ставь всему, в чём не уверен: такие записи будут отброшены.
- Если ничего нового нет — верни пустые массивы. Не выдумывай договорённости ради заполнения.`;

export class Analyzer {
  constructor({ apiKey, model, effort, clientImpl } = {}) {
    this.model = model;
    this.effort = effort;
    this.client = clientImpl || new Anthropic({ apiKey, maxRetries: 3 });
  }

  buildPrompt({ openAgreements, recentMessages, newMessages, now = new Date() }) {
    const registry = openAgreements.length
      ? openAgreements
          .map(
            (a) =>
              `#${a.id} [${a.status}] ${a.title} | ответственный: ${a.assignee || '—'} (${a.ownerSide}) | срок: ${a.due || '—'}`,
          )
          .join('\n')
      : '(реестр пуст)';

    const asLine = (m) =>
      `[${m.messageId}] ${m.date} ${m.author}: ${m.text.replace(/\s+/g, ' ').trim()}`;

    const context = recentMessages.length
      ? recentMessages.map(asLine).join('\n')
      : '(нет)';

    return `Сегодня ${localDate(now)}.

ТЕКУЩИЙ РЕЕСТР ОТКРЫТЫХ ДОГОВОРЁННОСТЕЙ:
${registry}

РАНЕЕ РАЗОБРАННЫЕ СООБЩЕНИЯ (только контекст, новые договорённости отсюда не заводи):
${context}

НОВЫЕ СООБЩЕНИЯ ДЛЯ РАЗБОРА:
${newMessages.map(asLine).join('\n')}

Разбери только новые сообщения и верни результат по схеме.`;
  }

  async analyze(input) {
    const prompt = this.buildPrompt(input);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: this.effort,
          format: { type: 'json_schema', schema: RESULT_SCHEMA },
        },
        messages: [{ role: 'user', content: prompt }],
      });

      if (response.stop_reason === 'refusal') {
        logger.warn('Модель отклонила разбор сообщений', response.stop_details ?? {});
        return { new_agreements: [], status_changes: [] };
      }
      if (response.stop_reason === 'max_tokens') {
        logger.warn('Ответ модели обрезан по max_tokens, разбор пропущен');
        return { new_agreements: [], status_changes: [] };
      }

      const text = response.content.find((block) => block.type === 'text')?.text;
      if (!text) {
        logger.warn('В ответе модели нет текстового блока', { attempt });
        continue;
      }
      try {
        const parsed = JSON.parse(text);
        return {
          new_agreements: Array.isArray(parsed.new_agreements) ? parsed.new_agreements : [],
          status_changes: Array.isArray(parsed.status_changes) ? parsed.status_changes : [],
        };
      } catch (error) {
        logger.warn('Не удалось разобрать JSON из ответа модели', { attempt, error: error.message });
      }
    }

    return { new_agreements: [], status_changes: [] };
  }
}

export { RESULT_SCHEMA, SYSTEM_PROMPT };
