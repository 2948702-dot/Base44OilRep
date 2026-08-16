import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bot } from '../src/index.js';
import { loadState, saveState, emptyState } from '../src/store.js';

const SOURCE_CHAT = -1001111111111;
const TEAM_CHAT = -1002222222222;
const ADMIN = 555;

function makeConfig(dir) {
  return {
    telegramToken: 'test',
    sourceChatId: SOURCE_CHAT,
    teamChatId: TEAM_CHAT,
    adminUserIds: [ADMIN],
    anthropicApiKey: 'test',
    model: 'claude-opus-5',
    effort: 'medium',
    analyzeIntervalMs: 60000,
    analyzeMinBatch: 5,
    notifyInSourceChat: false,
    digestHour: 10,
    digestMinute: 0,
    dataFile: join(dir, 'state.json'),
    contextWindow: 10,
  };
}

function fakeTelegram() {
  const sent = [];
  return {
    sent,
    async sendMessageSafe(chatId, text) {
      sent.push({ chatId, text });
      return { message_id: sent.length };
    },
    async sendMessage(chatId, text) {
      return this.sendMessageSafe(chatId, text);
    },
    async getUpdates() {
      return [];
    },
    async getMe() {
      return { username: 'test_bot' };
    },
  };
}

function fakeAnalyzer(result) {
  return {
    calls: [],
    async analyze(input) {
      this.calls.push(input);
      return result;
    },
  };
}

function groupMessage(text, overrides = {}) {
  return {
    update_id: Math.floor(Math.random() * 1e6),
    message: {
      message_id: 10,
      date: Math.floor(Date.now() / 1000),
      chat: { id: SOURCE_CHAT, type: 'supergroup' },
      from: { id: 777, first_name: 'Арина' },
      text,
      ...overrides,
    },
  };
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bobr-bot-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('сообщение из группы копится, разбор заводит договорённость и шлёт уведомление', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const analyzer = fakeAnalyzer({
      new_agreements: [
        {
          title: 'Настроить приём заявок в боте',
          owner_side: 'bobr',
          assignee: 'Арина',
          due: '2026-08-20',
          status: 'promised',
          evidence: 'настроим до четверга',
          message_id: 10,
          confidence: 0.9,
        },
      ],
      status_changes: [],
    });

    const bot = new Bot(makeConfig(dir), { telegram, analyzer });
    await bot.handleUpdate(groupMessage('Настроим приём заявок до четверга'));
    assert.equal(bot.state.pending.length, 1);

    await bot.runAnalysis();

    assert.equal(bot.state.agreements.length, 1);
    assert.equal(bot.state.agreements[0].due, '2026-08-20');
    assert.equal(bot.state.pending.length, 0, 'разобранные сообщения уходят из очереди');
    assert.equal(bot.state.recent.length, 1, 'и остаются как контекст');
    assert.equal(telegram.sent.length, 1);
    assert.equal(telegram.sent[0].chatId, TEAM_CHAT, 'уведомление уходит в наш чат, не в группу вендора');
  });
});

test('низкая уверенность и дубли отбрасываются', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const analyzer = fakeAnalyzer({
      new_agreements: [
        { title: 'Сомнительная догадка', owner_side: 'us', assignee: '', due: '', status: 'promised', evidence: '', message_id: 0, confidence: 0.3 },
        { title: 'Прислать договор', owner_side: 'bobr', assignee: '', due: '', status: 'promised', evidence: 'пришлём договор', message_id: 10, confidence: 0.95 },
        { title: 'прислать  ДОГОВОР!', owner_side: 'bobr', assignee: '', due: '', status: 'promised', evidence: 'ещё раз про договор', message_id: 11, confidence: 0.95 },
      ],
      status_changes: [],
    });

    const bot = new Bot(makeConfig(dir), { telegram, analyzer });
    await bot.handleUpdate(groupMessage('Пришлём договор'));
    await bot.runAnalysis();

    assert.equal(bot.state.agreements.length, 1);
    assert.equal(bot.state.agreements[0].title, 'Прислать договор');
  });
});

test('смена статуса из чата обновляет договорённость', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const analyzer = fakeAnalyzer({
      new_agreements: [],
      status_changes: [
        { id: 1, new_status: 'done', due: '', evidence: 'выложили в прод', message_id: 12, confidence: 0.9 },
      ],
    });

    const bot = new Bot(makeConfig(dir), { telegram, analyzer });
    bot.state.lastId = 1;
    bot.state.agreements.push({
      id: 1,
      title: 'Выложить бота в прод',
      ownerSide: 'bobr',
      assignee: '',
      due: '',
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: null,
      history: [{ status: 'in_progress', at: new Date().toISOString(), evidence: '', by: 'analyzer' }],
    });

    await bot.handleUpdate(groupMessage('Выложили в прод'));
    await bot.runAnalysis();

    assert.equal(bot.state.agreements[0].status, 'done');
    assert.match(telegram.sent[0].text, /Смена статуса/);
  });
});

test('команда /status от админа меняет статус, от чужого — нет', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const bot = new Bot(makeConfig(dir), { telegram, analyzer: fakeAnalyzer({ new_agreements: [], status_changes: [] }) });
    bot.state.lastId = 1;
    bot.state.agreements.push({
      id: 1,
      title: 'Проверить сценарий записи',
      ownerSide: 'us',
      assignee: '',
      due: '',
      status: 'promised',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: null,
      history: [{ status: 'promised', at: new Date().toISOString(), evidence: '', by: 'analyzer' }],
    });

    await bot.handleUpdate(groupMessage('/status 1 сделано проверили', { from: { id: 999, first_name: 'Чужой' } }));
    assert.equal(bot.state.agreements[0].status, 'promised');
    assert.match(telegram.sent.at(-1).text, /только администраторам/);

    await bot.handleUpdate(groupMessage('/status 1 сделано проверили', { from: { id: ADMIN, first_name: 'Андрей' } }));
    assert.equal(bot.state.agreements[0].status, 'done');
  });
});

test('команды не попадают в очередь на разбор', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const bot = new Bot(makeConfig(dir), { telegram, analyzer: fakeAnalyzer({ new_agreements: [], status_changes: [] }) });
    await bot.handleUpdate(groupMessage('/digest', { from: { id: ADMIN, first_name: 'Андрей' } }));
    assert.equal(bot.state.pending.length, 0);
  });
});

test('сообщения из посторонних чатов игнорируются', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const bot = new Bot(makeConfig(dir), { telegram, analyzer: fakeAnalyzer({ new_agreements: [], status_changes: [] }) });
    await bot.handleUpdate(groupMessage('Привет', { chat: { id: -1009999999999, type: 'supergroup' } }));
    assert.equal(bot.state.pending.length, 0);
  });
});

test('сбой анализатора оставляет сообщения в очереди', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const analyzer = {
      async analyze() {
        throw new Error('API недоступен');
      },
    };
    const bot = new Bot(makeConfig(dir), { telegram, analyzer });
    await bot.handleUpdate(groupMessage('Договорились созвониться в пятницу'));
    await bot.runAnalysis();

    assert.equal(bot.state.pending.length, 1, 'сообщение не потеряно');
    assert.equal(telegram.sent.length, 0);
  });
});

test('состояние переживает перезапуск', async () => {
  await withTempDir(async (dir) => {
    const config = makeConfig(dir);
    const state = emptyState();
    state.lastId = 7;
    state.updateOffset = 42;
    saveState(config.dataFile, state);

    const restored = loadState(config.dataFile);
    assert.equal(restored.lastId, 7);
    assert.equal(restored.updateOffset, 42);

    const bot = new Bot(config, {
      telegram: fakeTelegram(),
      analyzer: fakeAnalyzer({ new_agreements: [], status_changes: [] }),
    });
    assert.equal(bot.state.updateOffset, 42);
  });
});

test('дайджест отправляется раз в день после назначенного часа', async () => {
  await withTempDir(async (dir) => {
    const telegram = fakeTelegram();
    const bot = new Bot(makeConfig(dir), { telegram, analyzer: fakeAnalyzer({ new_agreements: [], status_changes: [] }) });

    const early = new Date('2026-08-16T08:30:00');
    await bot.checkDigest(early);
    assert.equal(telegram.sent.length, 0);

    const afterHour = new Date('2026-08-16T10:05:00');
    await bot.checkDigest(afterHour);
    assert.equal(telegram.sent.length, 1);

    await bot.checkDigest(new Date('2026-08-16T18:00:00'));
    assert.equal(telegram.sent.length, 1, 'повторно за тот же день не шлём');
  });
});
