import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelegramClient } from './telegram.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Разовая утилита для первичной настройки: показывает id чатов и людей,
 * которых бот уже видел. Нужен только TELEGRAM_BOT_TOKEN — остальные
 * переменные .env на этом этапе ещё не заполнены.
 */
function readToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  const envFile = resolve(root, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.+)\s*$/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('Не найден TELEGRAM_BOT_TOKEN — задайте его в .env или в переменных окружения');
}

export async function whereami({ telegram } = {}) {
  const client = telegram || new TelegramClient(readToken());
  const me = await client.getMe();
  const updates = await client.getUpdates(0, { timeoutSec: 0 });

  const chats = new Map();
  const users = new Map();

  for (const update of updates) {
    const message = update.message || update.edited_message || update.channel_post;
    if (!message) continue;
    if (message.chat) {
      chats.set(message.chat.id, {
        id: message.chat.id,
        title: message.chat.title || message.chat.username || 'личные сообщения',
        type: message.chat.type,
      });
    }
    if (message.from) {
      users.set(message.from.id, {
        id: message.from.id,
        name: [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || message.from.username,
      });
    }
  }

  return { me, chats: [...chats.values()], users: [...users.values()], updateCount: updates.length };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { me, chats, users, updateCount } = await whereami();
  console.log(`Бот: @${me.username} (id ${me.id})\n`);

  if (updateCount === 0) {
    console.log('Свежих сообщений нет.');
    console.log('Добавьте бота в нужный чат, напишите там любое сообщение и запустите команду снова.');
    console.log('Учтите: Telegram отдаёт только сообщения за последние 24 часа.');
  }

  if (chats.length > 0) {
    console.log('Чаты:');
    for (const chat of chats) console.log(`  ${chat.id}  ${chat.type.padEnd(10)} ${chat.title}`);
    console.log('\n  → id группы BOBR впишите в BOBR_CHAT_ID, id нашего чата — в TEAM_CHAT_ID');
  }

  if (users.length > 0) {
    console.log('\nЛюди:');
    for (const user of users) console.log(`  ${user.id}  ${user.name}`);
    console.log('\n  → ваш id впишите в ADMIN_USER_IDS (несколько — через запятую)');
  }
}
