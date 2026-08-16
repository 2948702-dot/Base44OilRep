import { logger } from './logger.js';

const MAX_MESSAGE_LENGTH = 4000;

export class TelegramClient {
  constructor(token, { fetchImpl = fetch } = {}) {
    this.base = `https://api.telegram.org/bot${token}`;
    this.fetchImpl = fetchImpl;
  }

  async call(method, payload = {}, { timeoutMs = 20000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.base}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      const retryAfter = body?.parameters?.retry_after;
      const error = new Error(`Telegram ${method}: ${body.description || response.status}`);
      error.code = response.status;
      error.retryAfter = retryAfter;
      throw error;
    }
    return body.result;
  }

  // Long polling: Telegram сам держит соединение до timeout секунд.
  async getUpdates(offset, { timeoutSec = 30 } = {}) {
    return this.call(
      'getUpdates',
      {
        offset,
        timeout: timeoutSec,
        allowed_updates: ['message', 'edited_message', 'channel_post'],
      },
      { timeoutMs: (timeoutSec + 15) * 1000 },
    );
  }

  async sendMessage(chatId, text, options = {}) {
    const chunks = splitMessage(text);
    let last;
    for (const chunk of chunks) {
      last = await this.call('sendMessage', {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options,
      });
    }
    return last;
  }

  async sendMessageSafe(chatId, text, options = {}) {
    try {
      return await this.sendMessage(chatId, text, options);
    } catch (error) {
      logger.error('Не удалось отправить сообщение', { chatId, error: error.message });
      return null;
    }
  }

  async getMe() {
    return this.call('getMe');
  }
}

export function splitMessage(text, limit = MAX_MESSAGE_LENGTH) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}
