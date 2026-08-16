export const STATUSES = ['promised', 'in_progress', 'done', 'overdue', 'cancelled'];

export const STATUS_LABELS = {
  promised: 'обещано',
  in_progress: 'в работе',
  done: 'сделано',
  overdue: 'просрочено',
  cancelled: 'отменено',
};

export const STATUS_ICONS = {
  promised: '🟡',
  in_progress: '🔵',
  done: '🟢',
  overdue: '🔴',
  cancelled: '⚪️',
};

export const SIDE_LABELS = {
  bobr: 'BOBR',
  us: 'наша сторона',
  unclear: 'не определено',
};

const OPEN_STATUSES = new Set(['promised', 'in_progress', 'overdue']);

// Разрешённые переходы. Закрытые статусы можно переоткрыть — договорённости
// в живом чате возвращаются в работу регулярно.
const TRANSITIONS = {
  promised: ['in_progress', 'done', 'overdue', 'cancelled'],
  in_progress: ['done', 'overdue', 'cancelled', 'promised'],
  overdue: ['in_progress', 'done', 'cancelled'],
  done: ['in_progress', 'overdue'],
  cancelled: ['promised', 'in_progress'],
};

export function isOpen(agreement) {
  return OPEN_STATUSES.has(agreement.status);
}

export function canTransition(from, to) {
  if (!STATUSES.includes(from) || !STATUSES.includes(to)) return false;
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function parseStatus(input) {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (STATUSES.includes(value)) return value;
  const byLabel = Object.entries(STATUS_LABELS).find(([, label]) => label === value);
  if (byLabel) return byLabel[0];
  const aliases = {
    'в работу': 'in_progress',
    работа: 'in_progress',
    готово: 'done',
    выполнено: 'done',
    срыв: 'overdue',
    просрочка: 'overdue',
    отмена: 'cancelled',
    ждём: 'promised',
    ждем: 'promised',
  };
  return aliases[value] || null;
}

export function createAgreement(state, fields, now = new Date()) {
  const at = now.toISOString();
  const agreement = {
    id: ++state.lastId,
    title: fields.title,
    ownerSide: fields.ownerSide || 'unclear',
    assignee: fields.assignee || '',
    due: fields.due || '',
    status: STATUSES.includes(fields.status) ? fields.status : 'promised',
    createdAt: at,
    updatedAt: at,
    source: fields.source || null,
    history: [
      {
        status: STATUSES.includes(fields.status) ? fields.status : 'promised',
        at,
        evidence: fields.evidence || '',
        by: fields.by || 'analyzer',
      },
    ],
  };
  state.agreements.push(agreement);
  return agreement;
}

export function findAgreement(state, id) {
  return state.agreements.find((item) => item.id === Number(id)) || null;
}

/**
 * Меняет статус договорённости, если переход разрешён.
 * Возвращает { changed, from, to, reason } — reason заполняется при отказе.
 */
export function applyStatusChange(agreement, nextStatus, { evidence = '', by = 'analyzer', now = new Date() } = {}) {
  const from = agreement.status;
  if (!STATUSES.includes(nextStatus)) {
    return { changed: false, from, to: nextStatus, reason: 'unknown_status' };
  }
  if (from === nextStatus) {
    return { changed: false, from, to: nextStatus, reason: 'same_status' };
  }
  if (!canTransition(from, nextStatus)) {
    return { changed: false, from, to: nextStatus, reason: 'transition_not_allowed' };
  }
  const at = now.toISOString();
  agreement.status = nextStatus;
  agreement.updatedAt = at;
  agreement.history.push({ status: nextStatus, at, evidence, by });
  return { changed: true, from, to: nextStatus, reason: null };
}

export function localDate(date = new Date()) {
  // sv-SE даёт YYYY-MM-DD в локальной зоне процесса (TZ из .env).
  return date.toLocaleDateString('sv-SE');
}

/**
 * Переводит просроченные договорённости в overdue.
 * Возвращает список изменённых договорённостей.
 */
export function sweepOverdue(state, now = new Date()) {
  const today = localDate(now);
  const changed = [];
  for (const agreement of state.agreements) {
    if (!agreement.due) continue;
    if (agreement.status !== 'promised' && agreement.status !== 'in_progress') continue;
    if (agreement.due >= today) continue;
    const result = applyStatusChange(agreement, 'overdue', {
      evidence: `Срок ${agreement.due} прошёл, отметки о выполнении нет`,
      by: 'scheduler',
      now,
    });
    if (result.changed) changed.push({ agreement, result });
  }
  return changed;
}

export function openAgreements(state) {
  return state.agreements.filter(isOpen);
}
