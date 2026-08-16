import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Минимальный .env-загрузчик, чтобы не тащить зависимость ради пяти строк.
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(root, '.env'));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана обязательная переменная окружения ${name}. См. .env.example`);
  return value;
}

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} должно быть числом, получено "${raw}"`);
  return value;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|да)$/i.test(raw.trim());
}

export function loadConfig(env = process.env) {
  const sourceChatId = Number(required('BOBR_CHAT_ID'));
  if (!Number.isFinite(sourceChatId)) throw new Error('BOBR_CHAT_ID должно быть числом');

  const adminUserIds = (env.ADMIN_USER_IDS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id !== 0);

  if (adminUserIds.length === 0) {
    throw new Error('ADMIN_USER_IDS пуст: некому управлять ботом командами');
  }

  const teamChatId = env.TEAM_CHAT_ID ? Number(env.TEAM_CHAT_ID) : adminUserIds[0];

  return {
    telegramToken: required('TELEGRAM_BOT_TOKEN'),
    sourceChatId,
    teamChatId,
    adminUserIds,
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    model: env.ANTHROPIC_MODEL || 'claude-opus-5',
    effort: env.ANTHROPIC_EFFORT || 'medium',
    analyzeIntervalMs: num('ANALYZE_INTERVAL_SEC', 120) * 1000,
    analyzeMinBatch: num('ANALYZE_MIN_BATCH', 5),
    notifyInSourceChat: bool('NOTIFY_IN_SOURCE_CHAT', false),
    digestHour: num('DIGEST_HOUR', 10),
    digestMinute: num('DIGEST_MINUTE', 0),
    dataFile: resolve(root, env.DATA_FILE || './data/state.json'),
    // Сколько последних сообщений чата держим как контекст для разбора.
    contextWindow: num('CONTEXT_WINDOW', 40),
  };
}
