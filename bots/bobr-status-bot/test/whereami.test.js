import test from 'node:test';
import assert from 'node:assert/strict';
import { whereami } from '../src/whereami.js';

function fakeTelegram(updates) {
  return {
    async getMe() {
      return { id: 1, username: 'BobrRegattaBot' };
    },
    async getUpdates() {
      return updates;
    },
  };
}

test('whereami собирает уникальные чаты и людей', async () => {
  const updates = [
    {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: -1001, type: 'supergroup', title: '645 ID | BOBR' },
        from: { id: 555, first_name: 'Андрей' },
        text: 'привет',
      },
    },
    {
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: -1001, type: 'supergroup', title: '645 ID | BOBR' },
        from: { id: 777, first_name: 'Арина', last_name: 'Игнатьева' },
        text: 'добрый день',
      },
    },
    {
      update_id: 3,
      message: {
        message_id: 3,
        chat: { id: -2002, type: 'group', title: 'Наш чат' },
        from: { id: 555, first_name: 'Андрей' },
        text: 'тест',
      },
    },
  ];

  const result = await whereami({ telegram: fakeTelegram(updates) });

  assert.equal(result.chats.length, 2, 'один и тот же чат не дублируется');
  assert.deepEqual(
    result.chats.map((c) => c.id).sort((a, b) => a - b),
    [-2002, -1001],
  );
  assert.equal(result.users.length, 2);
  assert.equal(result.users.find((u) => u.id === 777).name, 'Арина Игнатьева');
});

test('whereami не падает на пустой очереди', async () => {
  const result = await whereami({ telegram: fakeTelegram([]) });
  assert.equal(result.updateCount, 0);
  assert.deepEqual(result.chats, []);
});
