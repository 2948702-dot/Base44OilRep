import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { TelegramClient } from './telegram.js';
import { loadState, saveState } from './store.js';
import { Analyzer } from './analyzer.js';
import { handleCommand, parseCommand } from './commands.js';
import {
  applyStatusChange,
  createAgreement,
  findAgreement,
  localDate,
  openAgreements,
  sweepOverdue,
} from './agreements.js';
import { formatDigest, formatNewAgreement, formatStatusChange } from './format.js';

const MIN_CONFIDENCE = 0.6;

function normalizeTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDuplicate(state, title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return true;
  return state.agreements.some((existing) => normalizeTitle(existing.title) === normalized);
}

function authorName(from) {
  if (!from) return 'неизвестно';
  return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || `id${from.id}`;
}

export class Bot {
  constructor(config, { telegram, analyzer } = {}) {
    this.config = config;
    this.telegram = telegram || new TelegramClient(config.telegramToken);
    this.analyzer =
      analyzer ||
      new Analyzer({
        apiKey: config.anthropicApiKey,
        model: config.model,
        effort: config.effort,
      });
    this.state = loadState(config.dataFile);
    this.running = false;
  }

  save() {
    saveState(this.config.dataFile, this.state);
  }

  async notify(text) {
    await this.telegram.sendMessageSafe(this.config.teamChatId, text);
    if (this.config.notifyInSourceChat && this.config.teamChatId !== this.config.sourceChatId) {
      await this.telegram.sendMessageSafe(this.config.sourceChatId, text);
    }
  }

  collectMessage(message) {
    const text = message.text || message.caption;
    if (!text) return;
    this.state.pending.push({
      messageId: message.message_id,
      date: new Date((message.date || Date.now() / 1000) * 1000).toISOString().slice(0, 16).replace('T', ' '),
      author: authorName(message.from),
      text,
    });
  }

  async handleUpdate(update) {
    const message = update.message || update.edited_message || update.channel_post;
    if (!message) return;

    const command = parseCommand(message.text || '');
    if (command) {
      const reply = await handleCommand(
        {
          config: this.config,
          state: this.state,
          save: async () => this.save(),
          analyzeNow: async () => this.runAnalysis(),
        },
        message,
      );
      if (reply) {
        await this.telegram.sendMessageSafe(message.chat.id, reply, {
          reply_to_message_id: message.message_id,
        });
      }
      return;
    }

    if (message.chat?.id === this.config.sourceChatId) {
      this.collectMessage(message);
    }
  }

  applyAnalysis(result) {
    const notifications = [];

    for (const item of result.new_agreements) {
      if ((item.confidence ?? 0) < MIN_CONFIDENCE) continue;
      if (!item.title || isDuplicate(this.state, item.title)) continue;
      const agreement = createAgreement(this.state, {
        title: item.title,
        ownerSide: item.owner_side,
        assignee: item.assignee,
        due: /^\d{4}-\d{2}-\d{2}$/.test(item.due || '') ? item.due : '',
        status: item.status,
        evidence: item.evidence,
        source: item.message_id ? { chatId: this.config.sourceChatId, messageId: item.message_id } : null,
      });
      notifications.push(formatNewAgreement(agreement));
    }

    for (const item of result.status_changes) {
      if ((item.confidence ?? 0) < MIN_CONFIDENCE) continue;
      const agreement = findAgreement(this.state, item.id);
      if (!agreement) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(item.due || '')) agreement.due = item.due;
      const change = applyStatusChange(agreement, item.new_status, { evidence: item.evidence });
      if (change.changed) notifications.push(formatStatusChange(agreement, change));
    }

    return notifications;
  }

  async runAnalysis() {
    if (this.state.pending.length === 0) return [];

    const batch = this.state.pending;
    let notifications = [];
    try {
      const result = await this.analyzer.analyze({
        openAgreements: openAgreements(this.state),
        recentMessages: this.state.recent,
        newMessages: batch,
      });
      notifications = this.applyAnalysis(result);
    } catch (error) {
      logger.error('Разбор сообщений не удался, сообщения остаются в очереди', error);
      return [];
    }

    this.state.recent = [...this.state.recent, ...batch].slice(-this.config.contextWindow);
    this.state.pending = [];
    this.state.lastAnalyzedAt = new Date().toISOString();
    this.save();

    for (const text of notifications) {
      await this.notify(text);
    }
    return notifications;
  }

  async checkOverdue(now = new Date()) {
    const changed = sweepOverdue(this.state, now);
    if (changed.length === 0) return;
    this.save();
    for (const { agreement, result } of changed) {
      await this.notify(formatStatusChange(agreement, result));
    }
  }

  async checkDigest(now = new Date()) {
    const today = localDate(now);
    if (this.state.lastDigestDate === today) return;
    const due =
      now.getHours() > this.config.digestHour ||
      (now.getHours() === this.config.digestHour && now.getMinutes() >= this.config.digestMinute);
    if (!due) return;
    this.state.lastDigestDate = today;
    this.save();
    await this.notify(formatDigest(this.state, { title: `Сводка на ${today}` }));
  }

  shouldAnalyze(now = Date.now()) {
    if (this.state.paused) return false;
    if (this.state.pending.length === 0) return false;
    if (this.state.pending.length >= this.config.analyzeMinBatch) return true;
    const last = this.state.lastAnalyzedAt ? Date.parse(this.state.lastAnalyzedAt) : 0;
    return now - last >= this.config.analyzeIntervalMs;
  }

  async tick() {
    const updates = await this.telegram.getUpdates(this.state.updateOffset);
    for (const update of updates) {
      this.state.updateOffset = update.update_id + 1;
      try {
        await this.handleUpdate(update);
      } catch (error) {
        logger.error('Ошибка обработки апдейта', error);
      }
    }
    if (updates.length > 0) this.save();

    const now = new Date();
    await this.checkOverdue(now);
    if (this.shouldAnalyze(now.getTime())) await this.runAnalysis();
    await this.checkDigest(now);
  }

  async run() {
    const me = await this.telegram.getMe();
    logger.info(`Бот запущен как @${me.username}`, {
      источник: this.config.sourceChatId,
      уведомления: this.config.teamChatId,
      модель: this.config.model,
    });

    this.running = true;
    let backoffMs = 1000;
    while (this.running) {
      try {
        await this.tick();
        backoffMs = 1000;
      } catch (error) {
        if (error.code === 409) {
          logger.error('Конфликт getUpdates: где-то запущен второй экземпляр бота');
        } else {
          logger.error('Сбой цикла опроса', error);
        }
        const wait = error.retryAfter ? error.retryAfter * 1000 : backoffMs;
        await sleep(wait);
        backoffMs = Math.min(backoffMs * 2, 60000);
      }
    }
  }

  stop() {
    this.running = false;
    this.save();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const bot = new Bot(loadConfig());
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      logger.info(`Получен ${signal}, останавливаюсь`);
      bot.stop();
      process.exit(0);
    });
  }
  bot.run().catch((error) => {
    logger.error('Фатальная ошибка', error);
    process.exit(1);
  });
}
