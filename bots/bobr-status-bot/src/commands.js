import {
  STATUSES,
  STATUS_LABELS,
  applyStatusChange,
  createAgreement,
  findAgreement,
  parseStatus,
} from './agreements.js';
import { escapeHtml, formatAgreementCard, formatAgreementLine, formatDigest } from './format.js';

const HELP = [
  '<b>Бот контроля договорённостей</b>',
  '',
  '/agreements — открытые договорённости',
  '/agreements all — включая закрытые',
  '/card &lt;id&gt; — карточка с историей',
  '/status &lt;id&gt; &lt;статус&gt; [комментарий] — сменить статус вручную',
  '/new Текст | ГГГГ-ММ-ДД | bobr|us — завести договорённость вручную',
  '/digest — сводка сейчас',
  '/analyze — разобрать накопленные сообщения сейчас',
  '/pause, /resume — приостановить и возобновить разбор',
  '/chatid — id этого чата',
  '/whoami — ваш Telegram id',
  '',
  `Статусы: ${STATUSES.map((s) => `${s} (${STATUS_LABELS[s]})`).join(', ')}`,
].join('\n');

const OPEN_TO_ALL = new Set(['/start', '/help', '/chatid', '/whoami']);

export function parseCommand(text) {
  if (!text || !text.startsWith('/')) return null;
  const [head, ...rest] = text.trim().split(/\s+/);
  const name = head.split('@')[0].toLowerCase();
  return { name, args: rest.join(' ').trim() };
}

/**
 * Обрабатывает команду. Возвращает текст ответа или null, если реагировать не надо.
 */
export async function handleCommand(ctx, message) {
  const command = parseCommand(message.text);
  if (!command) return null;

  const userId = message.from?.id;
  const isAdmin = ctx.config.adminUserIds.includes(userId);

  if (!OPEN_TO_ALL.has(command.name) && !isAdmin) {
    return 'Команда доступна только администраторам бота.';
  }

  switch (command.name) {
    case '/start':
    case '/help':
      return HELP;

    case '/chatid':
      return `chat_id: <code>${message.chat.id}</code>\ntype: ${escapeHtml(message.chat.type)}`;

    case '/whoami':
      return `Ваш user_id: <code>${userId}</code>\nПрава администратора: ${isAdmin ? 'да' : 'нет'}`;

    case '/agreements': {
      const all = command.args.toLowerCase() === 'all';
      const items = all
        ? ctx.state.agreements
        : ctx.state.agreements.filter((a) => ['promised', 'in_progress', 'overdue'].includes(a.status));
      if (items.length === 0) return all ? 'Реестр пуст.' : 'Открытых договорённостей нет.';
      return items.map(formatAgreementLine).join('\n');
    }

    case '/card': {
      const agreement = findAgreement(ctx.state, command.args);
      if (!agreement) return 'Не нашёл договорённость с таким id.';
      return formatAgreementCard(agreement);
    }

    case '/status': {
      const [rawId, rawStatus, ...commentParts] = command.args.split(/\s+/);
      const agreement = findAgreement(ctx.state, rawId);
      if (!agreement) return 'Не нашёл договорённость с таким id. Список: /agreements';
      const status = parseStatus(rawStatus);
      if (!status) {
        return `Неизвестный статус. Доступные: ${STATUSES.map((s) => `${s} (${STATUS_LABELS[s]})`).join(', ')}`;
      }
      const result = applyStatusChange(agreement, status, {
        evidence: commentParts.join(' ') || `Ручная отметка: ${message.from?.first_name || userId}`,
        by: `user:${userId}`,
      });
      if (!result.changed) {
        if (result.reason === 'same_status') return 'Статус уже такой, ничего не изменилось.';
        return `Переход ${STATUS_LABELS[result.from]} → ${STATUS_LABELS[result.to]} не разрешён.`;
      }
      await ctx.save();
      return `Готово.\n${formatAgreementLine(agreement)}`;
    }

    case '/new': {
      if (!command.args) return 'Формат: /new Текст договорённости | ГГГГ-ММ-ДД | bobr';
      const [title, due = '', side = ''] = command.args.split('|').map((part) => part.trim());
      if (!title) return 'Нужен текст договорённости.';
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'Срок укажите как ГГГГ-ММ-ДД.';
      const ownerSide = ['bobr', 'us'].includes(side.toLowerCase()) ? side.toLowerCase() : 'unclear';
      const agreement = createAgreement(ctx.state, {
        title,
        due,
        ownerSide,
        status: 'promised',
        evidence: `Заведено вручную: ${message.from?.first_name || userId}`,
        by: `user:${userId}`,
      });
      await ctx.save();
      return `Записал.\n${formatAgreementLine(agreement)}`;
    }

    case '/digest':
      return formatDigest(ctx.state);

    case '/analyze': {
      const count = ctx.state.pending.length;
      if (count === 0) return 'Новых сообщений для разбора нет.';
      await ctx.analyzeNow();
      return `Разобрал ${count} сообщ.`;
    }

    case '/pause':
      ctx.state.paused = true;
      await ctx.save();
      return 'Разбор приостановлен. Сообщения продолжаю копить.';

    case '/resume':
      ctx.state.paused = false;
      await ctx.save();
      return 'Разбор возобновлён.';

    default:
      return null;
  }
}

export { HELP };
