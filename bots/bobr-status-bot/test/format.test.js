import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgreement, applyStatusChange } from '../src/agreements.js';
import { emptyState } from '../src/store.js';
import { escapeHtml, formatDigest, formatStatusChange } from '../src/format.js';
import { splitMessage } from '../src/telegram.js';

test('escapeHtml не пускает разметку из чата в сообщение бота', () => {
  assert.equal(escapeHtml('<b>привет</b> & пока'), '&lt;b&gt;привет&lt;/b&gt; &amp; пока');
});

test('текст договорённости экранируется в уведомлении', () => {
  const state = emptyState();
  const agreement = createAgreement(state, { title: 'Ответить <script>', status: 'promised' });
  const change = applyStatusChange(agreement, 'done', { evidence: 'сделали & закрыли' });

  const text = formatStatusChange(agreement, change);
  assert.ok(text.includes('&lt;script&gt;'));
  assert.ok(text.includes('сделали &amp; закрыли'));
  assert.ok(!text.includes('<script>'));
});

test('дайджест сортирует просрочку наверх и считает статусы', () => {
  const state = emptyState();
  createAgreement(state, { title: 'Обещано', status: 'promised' });
  const late = createAgreement(state, { title: 'Просрочено', status: 'promised', due: '2020-01-01' });
  applyStatusChange(late, 'overdue');
  const done = createAgreement(state, { title: 'Готово', status: 'promised' });
  applyStatusChange(done, 'done');

  const digest = formatDigest(state);
  assert.ok(digest.indexOf('Просрочено') < digest.indexOf('Обещано'));
  assert.ok(!digest.includes('Готово'), 'закрытые в сводку не попадают');
  assert.ok(digest.includes('просрочено: 1'));
});

test('пустой дайджест читаем', () => {
  assert.ok(formatDigest(emptyState()).includes('Открытых договорённостей нет'));
});

test('splitMessage режет по строкам и укладывается в лимит', () => {
  const text = Array.from({ length: 300 }, (_, i) => `строка номер ${i}`).join('\n');
  const chunks = splitMessage(text, 1000);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 1000);
  assert.equal(chunks.join('\n'), text);
});
