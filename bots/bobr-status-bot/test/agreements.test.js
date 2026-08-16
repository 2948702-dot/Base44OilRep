import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStatusChange,
  canTransition,
  createAgreement,
  localDate,
  openAgreements,
  parseStatus,
  sweepOverdue,
} from '../src/agreements.js';
import { emptyState } from '../src/store.js';

test('переходы статусов', () => {
  assert.equal(canTransition('promised', 'done'), true);
  assert.equal(canTransition('done', 'in_progress'), true, 'выполненное можно переоткрыть');
  assert.equal(canTransition('promised', 'promised'), false, 'переход в тот же статус не считается');
  assert.equal(canTransition('cancelled', 'done'), false);
  assert.equal(canTransition('promised', 'выдумка'), false);
});

test('parseStatus понимает русские подписи и алиасы', () => {
  assert.equal(parseStatus('done'), 'done');
  assert.equal(parseStatus('Сделано'), 'done');
  assert.equal(parseStatus('в работе'), 'in_progress');
  assert.equal(parseStatus('отмена'), 'cancelled');
  assert.equal(parseStatus('чтотоне'), null);
  assert.equal(parseStatus(undefined), null);
});

test('createAgreement нумерует записи и пишет историю', () => {
  const state = emptyState();
  const first = createAgreement(state, { title: 'Настроить интеграцию', status: 'promised' });
  const second = createAgreement(state, { title: 'Прислать счёт', status: 'in_progress' });

  assert.equal(first.id, 1);
  assert.equal(second.id, 2);
  assert.equal(state.agreements.length, 2);
  assert.equal(first.history.length, 1);
  assert.equal(first.history[0].status, 'promised');
});

test('applyStatusChange отклоняет запрещённый переход и не портит историю', () => {
  const state = emptyState();
  const agreement = createAgreement(state, { title: 'Отменённая задача', status: 'promised' });
  applyStatusChange(agreement, 'cancelled');

  const result = applyStatusChange(agreement, 'done');
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'transition_not_allowed');
  assert.equal(agreement.status, 'cancelled');
  assert.equal(agreement.history.length, 2);
});

test('sweepOverdue переводит просроченные и не трогает закрытые', () => {
  const now = new Date('2026-08-16T09:00:00');
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getTime() - 24 * 3600 * 1000));

  const state = emptyState();
  const late = createAgreement(state, { title: 'Просроченная', status: 'promised', due: yesterday });
  const onTime = createAgreement(state, { title: 'Сегодняшняя', status: 'in_progress', due: today });
  const finished = createAgreement(state, { title: 'Закрытая', status: 'promised', due: yesterday });
  applyStatusChange(finished, 'done');

  const changed = sweepOverdue(state, now);

  assert.equal(changed.length, 1);
  assert.equal(changed[0].agreement.id, late.id);
  assert.equal(late.status, 'overdue');
  assert.equal(onTime.status, 'in_progress');
  assert.equal(finished.status, 'done');
});

test('openAgreements не включает done и cancelled', () => {
  const state = emptyState();
  createAgreement(state, { title: 'Открытая', status: 'promised' });
  const done = createAgreement(state, { title: 'Готовая', status: 'promised' });
  applyStatusChange(done, 'done');

  const open = openAgreements(state);
  assert.equal(open.length, 1);
  assert.equal(open[0].title, 'Открытая');
});
