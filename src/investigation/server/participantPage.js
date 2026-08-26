/**
 * Страница участника интервью.
 *
 * Отдельная самодостаточная страница, а не часть приложения следователя. Причина не
 * в удобстве: участник не является пользователем платформы, у него нет учётной записи,
 * и он не должен получать ни одного байта интерфейса, где существуют версии,
 * противоречия и чужие показания.
 *
 * Токен берётся из адреса и никуда не сохраняется. Внешних ресурсов страница не
 * загружает: материалы расследования не должны порождать запросов к чужим доменам.
 */

const STYLE = `
:root {
  --bg: #f7f7f5; --fg: #1b1b1a; --muted: #5c5c58; --line: #dcdcd6;
  --card: #ffffff; --accent: #2f5d50; --accent-fg: #ffffff; --warn: #7a4a00;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17181a; --fg: #e9e9e6; --muted: #a0a09b; --line: #33343a;
    --card: #1f2023; --accent: #6fae9b; --accent-fg: #10201b; --warn: #e0b070;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
main { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 0 0 .5rem; }
p.lead { color: var(--muted); margin: 0 0 1.5rem; }
section.card {
  background: var(--card); border: 1px solid var(--line); border-radius: .6rem;
  padding: 1rem 1.1rem; margin-bottom: 1rem;
}
.q-num { color: var(--muted); font-size: .85rem; letter-spacing: .04em; text-transform: uppercase; }
.q-text { font-weight: 600; margin: .3rem 0 .8rem; }
textarea {
  width: 100%; min-height: 8rem; padding: .7rem; border-radius: .4rem;
  border: 1px solid var(--line); background: var(--bg); color: var(--fg);
  font: inherit; resize: vertical;
}
button {
  margin-top: .7rem; padding: .6rem 1.1rem; border: 0; border-radius: .4rem;
  background: var(--accent); color: var(--accent-fg); font: inherit; font-weight: 600;
  cursor: pointer;
}
button:disabled { opacity: .5; cursor: default; }
.answered { border-left: 3px solid var(--accent); }
.answer-body { white-space: pre-wrap; color: var(--muted); }
.notice { border-left: 3px solid var(--warn); padding-left: .8rem; color: var(--muted); }
.status { margin-top: .5rem; font-size: .9rem; color: var(--muted); min-height: 1.4rem; }
.error { color: var(--warn); }
footer { margin-top: 2.5rem; color: var(--muted); font-size: .85rem; }
ul.rules { color: var(--muted); padding-left: 1.1rem; }
ul.rules li { margin: .3rem 0; }
`;

const SCRIPT = `
const token = location.pathname.split('/').filter(Boolean).pop();
const root = document.getElementById('root');

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
}

async function api(path, options) {
  const response = await fetch('/api/participant/' + token + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Не удалось связаться с сервером');
  }
  return response.json();
}

function renderError(message) {
  root.replaceChildren(
    el('section', { class: 'card' }, [
      el('h1', { text: 'Ссылка недействительна' }),
      el('p', { class: 'lead', text: message }),
      el('p', {
        class: 'notice',
        text: 'Если вы получили ссылку недавно, обратитесь к тому, кто её прислал: '
          + 'срок действия ссылки ограничен.',
      }),
    ]),
  );
}

function questionCard(item, state) {
  if (item.answered) {
    const saved = state.answers.find((a) => a.question_id === item.id);
    return el('section', { class: 'card answered' }, [
      el('div', { class: 'q-num', text: 'Вопрос ' + item.sequence + ' · ответ сохранён' }),
      el('div', { class: 'q-text', text: item.question }),
      el('div', { class: 'answer-body', text: (saved && (saved.text || saved.transcript)) || '' }),
    ]);
  }

  const area = el('textarea', {
    id: 'a-' + item.id,
    'aria-label': 'Ответ на вопрос ' + item.sequence,
    placeholder: 'Расскажите своими словами. Если чего-то не помните точно, так и напишите.',
  });
  const status = el('div', { class: 'status', role: 'status' });
  const button = el('button', { type: 'button', text: 'Отправить ответ' });

  button.addEventListener('click', async () => {
    const text = area.value.trim();
    if (!text) {
      status.textContent = 'Ответ пока пустой.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Отправляю…';
    try {
      await api('/answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId: item.id, text }),
      });
      status.textContent = 'Ответ сохранён.';
      await load();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'status error';
      button.disabled = false;
    }
  });

  return el('section', { class: 'card' }, [
    el('div', { class: 'q-num', text: 'Вопрос ' + item.sequence }),
    el('div', { class: 'q-text', text: item.question }),
    area, button, status,
  ]);
}

function render(state) {
  const pending = state.questions.filter((q) => !q.answered);
  const nodes = [
    el('h1', { text: 'Здравствуйте, ' + state.person_name }),
    el('p', {
      class: 'lead',
      text: 'Вас просят описать известные вам обстоятельства. Отвечайте своими словами '
        + 'и в своём темпе: ссылка действует, пока вы не закончите.',
    }),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Как это устроено' }),
      el('ul', { class: 'rules' }, [
        el('li', { text: 'Отвечайте так, как помните. Если не уверены — напишите «не помню точно»: это нормальный и полезный ответ.' }),
        el('li', { text: 'Не додумывайте детали, чтобы ответ выглядел полнее. Приблизительное «около семи» лучше выдуманного точного времени.' }),
        el('li', { text: 'Ваши ответы видит только тот, кто ведёт разбирательство. Другим участникам они не показываются.' }),
        el('li', { text: 'Ответ сохраняется в том виде, в каком вы его отправили, и не переписывается.' }),
      ]),
    ]),
  ];

  if (pending.length === 0) {
    nodes.push(el('section', { class: 'card' }, [
      el('h2', { text: 'Вопросов пока нет' }),
      el('p', { text: 'Вы ответили на всё, что было задано. Если понадобятся уточнения, ссылка обновится — можно вернуться по ней позже.' }),
    ]));
  }

  for (const item of state.questions) nodes.push(questionCard(item, state));

  nodes.push(el('footer', {
    text: 'Материалы этого разбирательства обрабатываются организацией, которая его ведёт. '
      + 'Ответы сохраняются вместе со временем отправки.',
  }));

  root.replaceChildren(...nodes);
}

async function load() {
  try {
    render(await api('', {}));
  } catch (error) {
    renderError(error.message);
  }
}

load();
`;

/**
 * @returns {string} самодостаточная HTML-страница без внешних ресурсов
 */
export function renderParticipantPage() {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>Интервью</title>
<style>${STYLE}</style>
</head>
<body>
<main id="root"><p class="lead">Загружаю…</p></main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
