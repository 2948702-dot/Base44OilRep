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
button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--line); }
.row { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }
.rec-dot {
  display: inline-block; width: .6rem; height: .6rem; border-radius: 50%;
  background: var(--warn); margin-right: .4rem;
}
audio { width: 100%; margin-top: .7rem; }
.pending { color: var(--warn); }
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

// Запись голоса доступна не везде: старый браузер или доступ по http вместо https
// оставят участника только с текстовым полем, и это должно работать без ошибок.
const voiceSupported = Boolean(
  navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder,
);

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

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** Блок записи голоса. Возвращает null, если запись недоступна. */
function voiceBlock(questionId, status, onSent) {
  if (!voiceSupported) return null;

  let recorder = null;
  let chunks = [];
  let blob = null;
  let ticker = null;
  let seconds = 0;

  const timer = el('span', { text: '' });
  const preview = el('audio', { controls: 'controls', hidden: 'hidden' });
  const startBtn = el('button', { type: 'button', class: 'secondary', text: 'Записать голосом' });
  const stopBtn = el('button', { type: 'button', text: 'Остановить запись', hidden: 'hidden' });
  const sendBtn = el('button', { type: 'button', text: 'Отправить запись', hidden: 'hidden' });
  const againBtn = el('button', { type: 'button', class: 'secondary', text: 'Записать заново', hidden: 'hidden' });

  function reset() {
    blob = null;
    chunks = [];
    seconds = 0;
    preview.hidden = true;
    preview.removeAttribute('src');
    sendBtn.hidden = true;
    againBtn.hidden = true;
    startBtn.hidden = false;
    timer.textContent = '';
  }

  startBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
        blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        preview.src = URL.createObjectURL(blob);
        preview.hidden = false;
        sendBtn.hidden = false;
        againBtn.hidden = false;
      });
      recorder.start();
      startBtn.hidden = true;
      stopBtn.hidden = false;
      seconds = 0;
      timer.innerHTML = '';
      timer.appendChild(el('span', { class: 'rec-dot' }));
      timer.appendChild(document.createTextNode('идёт запись 0:00'));
      ticker = setInterval(() => {
        seconds += 1;
        timer.innerHTML = '';
        timer.appendChild(el('span', { class: 'rec-dot' }));
        timer.appendChild(document.createTextNode('идёт запись ' + formatDuration(seconds)));
      }, 1000);
    } catch (error) {
      status.textContent = 'Не удалось получить доступ к микрофону. Ответьте, пожалуйста, текстом.';
      status.className = 'status error';
      startBtn.hidden = true;
    }
  });

  stopBtn.addEventListener('click', () => {
    if (ticker) clearInterval(ticker);
    stopBtn.hidden = true;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    timer.textContent = 'записано ' + formatDuration(seconds);
  });

  againBtn.addEventListener('click', reset);

  sendBtn.addEventListener('click', async () => {
    if (!blob) return;
    sendBtn.disabled = true;
    status.className = 'status';
    status.textContent = 'Отправляю запись…';
    try {
      const form = new FormData();
      form.append('questionId', questionId);
      form.append('duration', String(seconds));
      form.append('audio', blob, 'answer.webm');
      await api('/answers', { method: 'POST', body: form });
      status.textContent = 'Запись принята, готовится расшифровка.';
      await onSent();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'status error';
      sendBtn.disabled = false;
    }
  });

  return el('div', {}, [
    el('div', { class: 'row' }, [startBtn, stopBtn, sendBtn, againBtn, timer]),
    preview,
  ]);
}

/** Карточка отвеченного вопроса, включая подтверждение расшифровки. */
function answeredCard(item, saved) {
  const nodes = [
    el('div', { class: 'q-num', text: 'Вопрос ' + item.sequence + ' · ответ сохранён' }),
    el('div', { class: 'q-text', text: item.question }),
  ];

  if (saved && saved.transcription_pending) {
    nodes.push(el('p', {
      class: 'pending',
      text: 'Голосовой ответ принят. Расшифровка готовится — вернитесь по этой же ссылке '
        + 'чуть позже, чтобы проверить текст.',
    }));
    return el('section', { class: 'card answered' }, nodes);
  }

  if (saved && saved.is_voice && saved.transcript && !saved.transcript_confirmed) {
    // Машинная расшифровка не считается тем, что сказал человек, пока он это
    // не признал. Обе версии остаются в деле в любом случае.
    const area = el('textarea', { 'aria-label': 'Расшифровка вашего ответа' });
    area.value = saved.transcript;
    const status = el('div', { class: 'status', role: 'status' });
    const confirm = el('button', { type: 'button', text: 'Всё верно' });
    const correct = el('button', { type: 'button', class: 'secondary', text: 'Сохранить исправление' });

    async function send(body) {
      confirm.disabled = true;
      correct.disabled = true;
      status.className = 'status';
      status.textContent = 'Сохраняю…';
      try {
        await api('/answers/' + saved.id + '/transcript', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        await load();
      } catch (error) {
        status.textContent = error.message;
        status.className = 'status error';
        confirm.disabled = false;
        correct.disabled = false;
      }
    }

    confirm.addEventListener('click', () => send({}));
    correct.addEventListener('click', () => send({ text: area.value }));

    nodes.push(
      el('p', {
        text: 'Мы расшифровали вашу запись. Проверьте текст: если что-то распознано неверно, '
          + 'поправьте. Сама запись сохраняется в любом случае.',
      }),
      area,
      el('div', { class: 'row' }, [confirm, correct]),
      status,
    );
    return el('section', { class: 'card answered' }, nodes);
  }

  nodes.push(el('div', {
    class: 'answer-body',
    text: (saved && (saved.transcript || saved.text)) || '',
  }));
  return el('section', { class: 'card answered' }, nodes);
}

function questionCard(item, state) {
  if (item.answered) {
    return answeredCard(item, state.answers.find((a) => a.question_id === item.id));
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
    status.className = 'status';
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

  const voice = voiceBlock(item.id, status, load);

  return el('section', { class: 'card' }, [
    el('div', { class: 'q-num', text: 'Вопрос ' + item.sequence }),
    el('div', { class: 'q-text', text: item.question }),
    area,
    el('div', { class: 'row' }, [button]),
    voice ? el('p', { class: 'q-num', text: 'или ответьте голосом' }) : null,
    voice,
    status,
  ]);
}

function render(state) {
  const pending = state.questions.filter((q) => !q.answered);
  const rules = [
    'Отвечайте так, как помните. Если не уверены — напишите «не помню точно»: это нормальный и полезный ответ.',
    'Не додумывайте детали, чтобы ответ выглядел полнее. Приблизительное «около семи» лучше выдуманного точного времени.',
    'Ваши ответы видит только тот, кто ведёт разбирательство. Другим участникам они не показываются.',
    'Ответ сохраняется в том виде, в каком вы его отправили, и не переписывается.',
  ];
  if (voiceSupported) {
    rules.push('Можно ответить голосом. Запись сохраняется целиком, а расшифровку вы сможете проверить и поправить.');
  }

  const nodes = [
    el('h1', { text: 'Здравствуйте, ' + state.person_name }),
    el('p', {
      class: 'lead',
      text: 'Вас просят описать известные вам обстоятельства. Отвечайте своими словами '
        + 'и в своём темпе: ссылка действует, пока вы не закончите.',
    }),
    el('section', { class: 'card' }, [
      el('h2', { text: 'Как это устроено' }),
      el('ul', { class: 'rules' }, rules.map((text) => el('li', { text }))),
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
