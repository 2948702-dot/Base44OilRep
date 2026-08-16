import { STATUS_ICONS, STATUS_LABELS, SIDE_LABELS, isOpen } from './agreements.js';

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function statusTag(status) {
  return `${STATUS_ICONS[status] || ''} ${STATUS_LABELS[status] || status}`.trim();
}

function dueTag(due) {
  return due ? ` · срок ${escapeHtml(due)}` : '';
}

function whoTag(agreement) {
  const side = SIDE_LABELS[agreement.ownerSide] || agreement.ownerSide;
  return agreement.assignee ? `${escapeHtml(agreement.assignee)} (${side})` : side;
}

export function formatAgreementLine(agreement) {
  return `<b>#${agreement.id}</b> ${escapeHtml(agreement.title)}\n    ${statusTag(agreement.status)} · ${whoTag(agreement)}${dueTag(agreement.due)}`;
}

export function formatNewAgreement(agreement) {
  const lines = [
    '📌 <b>Новая договорённость</b>',
    formatAgreementLine(agreement),
  ];
  const evidence = agreement.history.at(-1)?.evidence;
  if (evidence) lines.push(`    <i>${escapeHtml(evidence)}</i>`);
  return lines.join('\n');
}

export function formatStatusChange(agreement, change) {
  const lines = [
    '🔄 <b>Смена статуса</b>',
    `<b>#${agreement.id}</b> ${escapeHtml(agreement.title)}`,
    `    ${statusTag(change.from)} → ${statusTag(change.to)}`,
    `    ${whoTag(agreement)}${dueTag(agreement.due)}`,
  ];
  const evidence = agreement.history.at(-1)?.evidence;
  if (evidence) lines.push(`    <i>${escapeHtml(evidence)}</i>`);
  return lines.join('\n');
}

export function formatDigest(state, { title = 'Сводка по договорённостям' } = {}) {
  const open = state.agreements.filter(isOpen);
  if (open.length === 0) {
    return `📋 <b>${escapeHtml(title)}</b>\nОткрытых договорённостей нет.`;
  }

  const order = { overdue: 0, in_progress: 1, promised: 2 };
  const sorted = [...open].sort((a, b) => {
    const byStatus = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.id - b.id;
  });

  const counts = sorted.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const summary = Object.entries(counts)
    .map(([status, count]) => `${STATUS_ICONS[status]} ${STATUS_LABELS[status]}: ${count}`)
    .join(' · ');

  return [
    `📋 <b>${escapeHtml(title)}</b>`,
    summary,
    '',
    ...sorted.map(formatAgreementLine),
  ].join('\n');
}

export function formatAgreementCard(agreement) {
  const lines = [formatAgreementLine(agreement), '', '<b>История:</b>'];
  for (const entry of agreement.history) {
    const when = entry.at.slice(0, 16).replace('T', ' ');
    lines.push(`  ${when} — ${STATUS_LABELS[entry.status] || entry.status} (${escapeHtml(entry.by)})`);
    if (entry.evidence) lines.push(`      <i>${escapeHtml(entry.evidence)}</i>`);
  }
  return lines.join('\n');
}
