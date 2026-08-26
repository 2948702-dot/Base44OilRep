/**
 * Рабочее место следователя (§43–§47 ТЗ).
 *
 * Самодостаточная страница, отдаваемая самим API: ни одного внешнего запроса, никакой
 * сборки. Материалы расследований не должны порождать обращений к чужим доменам,
 * а деплой не должен зависеть от доступности стороннего CDN.
 *
 * Три правила экрана, вытекающие из методологии:
 *
 * 1. Цвет никогда не единственный носитель смысла (§44 ТЗ): рядом с любой пометкой
 *    состояния стоит слово.
 * 2. Опровергающее доказательство показывается рядом с подтверждающим, а не прячется
 *    за отдельным фильтром (§71 ТЗ).
 * 3. Приблизительное время выводится приблизительным: «около 19:00», а не «19:00».
 */

const STYLE = `
:root {
  --bg: #f5f5f3; --panel: #ffffff; --fg: #1a1a19; --muted: #5f5f5a; --line: #dcdcd5;
  --accent: #2f5d50; --accent-fg: #ffffff; --warn: #8a4b00; --danger: #8c2f2f;
  --ok: #2f5d50; --chip: #eceae4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #151618; --panel: #1e1f22; --fg: #e8e8e5; --muted: #a0a099; --line: #32333a;
    --accent: #6fae9b; --accent-fg: #10201b; --warn: #dfae6e; --danger: #e08585;
    --ok: #6fae9b; --chip: #26272b;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--accent); }
header.top {
  display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;
  padding: .7rem 1rem; background: var(--panel); border-bottom: 1px solid var(--line);
  position: sticky; top: 0; z-index: 10;
}
header.top .case-name { font-weight: 600; }
header.top .spacer { flex: 1; }
nav.tabs { display: flex; gap: .3rem; flex-wrap: wrap; padding: .5rem 1rem 0;
  background: var(--panel); border-bottom: 1px solid var(--line); }
nav.tabs a {
  padding: .45rem .8rem; border-radius: .4rem .4rem 0 0; text-decoration: none;
  color: var(--muted); border: 1px solid transparent; border-bottom: none;
}
nav.tabs a.active { color: var(--fg); background: var(--bg); border-color: var(--line); font-weight: 600; }
main { padding: 1.2rem 1rem 4rem; max-width: 78rem; margin: 0 auto; }
h1 { font-size: 1.35rem; margin: 0 0 .2rem; }
h2 { font-size: 1.05rem; margin: 1.6rem 0 .6rem; }
p.muted, .muted { color: var(--muted); }
.grid { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: .5rem; padding: .85rem 1rem; }
.card h3 { margin: 0 0 .4rem; font-size: .95rem; }
.stat { font-size: 1.7rem; font-weight: 600; line-height: 1.1; }
.chip {
  display: inline-block; padding: .1rem .5rem; border-radius: 1rem; background: var(--chip);
  font-size: .8rem; border: 1px solid var(--line); white-space: nowrap;
}
.chip.warn { color: var(--warn); border-color: var(--warn); }
.chip.danger { color: var(--danger); border-color: var(--danger); }
.chip.ok { color: var(--ok); border-color: var(--ok); }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; position: sticky; top: 0; background: var(--panel); }
.scroll { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: .5rem; }
input[type=search], input[type=text], input[type=password], select {
  padding: .45rem .6rem; border: 1px solid var(--line); border-radius: .4rem;
  background: var(--panel); color: var(--fg); font: inherit;
}
button {
  padding: .45rem .9rem; border: 0; border-radius: .4rem; background: var(--accent);
  color: var(--accent-fg); font: inherit; font-weight: 600; cursor: pointer;
}
button.ghost { background: transparent; color: var(--accent); border: 1px solid var(--line); }
button:disabled { opacity: .5; cursor: default; }
.filters { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-bottom: .8rem; }
.stack { display: flex; gap: .4rem; flex-wrap: wrap; align-items: center; margin-top: .45rem; }
.board { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); align-items: start; }
.board section { background: var(--panel); border: 1px solid var(--line); border-radius: .5rem; padding: .7rem; }
.board h3 { margin: 0 0 .5rem; font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.hyp { border: 1px solid var(--line); border-radius: .4rem; padding: .6rem; margin-bottom: .6rem; }
.timeline-item { border-left: 3px solid var(--line); padding: .1rem 0 .9rem 1rem; margin-left: .4rem; }
.timeline-item.competing { border-left-color: var(--warn); }
details { margin-top: .4rem; }
summary { cursor: pointer; color: var(--muted); }
.login { max-width: 22rem; margin: 4rem auto; }
.login label { display: block; margin: .8rem 0 .2rem; }
.login input { width: 100%; }
.error { color: var(--danger); }
.empty { color: var(--muted); padding: 1.2rem; text-align: center; }
ul.plain { margin: .3rem 0; padding-left: 1.1rem; }
ul.plain li { margin: .15rem 0; }
`;

const SCRIPT_CORE = `
const state = { token: null, user: null, caseId: null, caseInfo: null };

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  // Дети разворачиваются рекурсивно, а не-узлы отбрасываются: один случайно
  // попавший в список пустой массив иначе роняет весь экран.
  const append = function (child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(append); return; }
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
      return;
    }
    if (child instanceof Node) node.appendChild(child);
  };
  append(children);
  return node;
}

/**
 * Замена содержимого узла. Собственная обёртка нужна потому, что replaceChildren
 * превращает null в текстовый узел «null»: условный блок, которого не должно быть,
 * иначе появляется на экране словом.
 */
function setChildren(node, children) {
  const flat = [];
  const push = function (child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(push); return; }
    flat.push(typeof child === 'string' ? document.createTextNode(child) : child);
  };
  push(children);
  node.replaceChildren.apply(node, flat);
}

/**
 * Действие с объяснением.
 *
 * Утверждение вывода, закрытие противоречия и выпуск отчёта требуют причины: решение
 * без объяснения невозможно проверить потом, а именно это и обещает продукт. Поле
 * причины показывается сразу рядом с кнопкой, а не в отдельном окне, чтобы человек
 * видел, что именно он подтверждает.
 */
function noteAction(label, placeholder, handler, options) {
  const opts = options || {};
  const note = el('input', { type: 'text', placeholder: placeholder, style: 'min-width:16rem' });
  const status = el('span', { class: 'muted' });
  const confirm = el('button', { class: opts.ghost ? 'ghost' : '', text: label });

  confirm.addEventListener('click', async function () {
    const value = note.value.trim();
    if (!value) { status.textContent = 'Нужно объяснение.'; return; }
    confirm.disabled = true;
    status.className = 'muted';
    status.textContent = 'Выполняю…';
    try {
      await handler(value);
      status.textContent = 'Готово.';
      await render();
    } catch (error) {
      status.className = 'error';
      status.textContent = error.message;
      confirm.disabled = false;
    }
  });

  return el('div', { class: 'filters' }, [note, confirm, status]);
}

/** Действие без объяснения: запуск анализа, подготовка интервью. */
function action(label, handler, options) {
  const opts = options || {};
  const status = el('span', { class: 'muted' });
  const button = el('button', { class: opts.ghost ? 'ghost' : '', text: label });

  button.addEventListener('click', async function () {
    button.disabled = true;
    status.className = 'muted';
    status.textContent = 'Выполняю…';
    try {
      const result = await handler();
      if (result && result.message) {
        status.textContent = result.message;
        // Ссылка участника показывается один раз: в базе остаётся только её хэш,
        // и повторно её выдать нельзя — только выпустить новую.
        if (result.link) {
          status.appendChild(document.createElement('br'));
          status.appendChild(el('code', { text: result.link }));
        }
        button.disabled = false;
        if (result.reload) await render();
      } else {
        status.textContent = 'Готово.';
        await render();
      }
    } catch (error) {
      status.className = 'error';
      status.textContent = error.message;
      button.disabled = false;
    }
  });

  return el('span', { class: 'filters', style: 'display:inline-flex' }, [button, status]);
}

function readToken() {
  try { return sessionStorage.getItem('inv_token'); } catch (e) { return null; }
}
function writeToken(value) {
  try { if (value) sessionStorage.setItem('inv_token', value); else sessionStorage.removeItem('inv_token'); }
  catch (e) { /* приватный режим: работа продолжается в пределах вкладки */ }
}

async function api(path, options) {
  const opts = options || {};
  const response = await fetch(path, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { authorization: 'Bearer ' + state.token },
      opts.body ? { 'content-type': 'application/json' } : {},
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (response.status === 401) { logout(); throw new Error('Сессия истекла'); }
  const payload = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(payload.error || ('Ошибка ' + response.status));
  return payload;
}

function logout() {
  state.token = null; state.user = null;
  writeToken(null);
  location.hash = '';
  render();
}

// ─────────────────────────── Отображение значений ───────────────────────────
//
// Каждая пометка состояния сопровождается словом: цвет не должен быть единственным
// способом понять, подтверждено утверждение или опровергнуто (§44 ТЗ).

const CONFIDENCE_RU = {
  very_low: 'очень низкая', low: 'низкая', moderate: 'средняя',
  high: 'высокая', very_high: 'очень высокая',
};
const CORROBORATION_RU = {
  uncorroborated: 'не подтверждено', single_source: 'один источник',
  multi_source: 'несколько источников', independently_corroborated: 'независимо подтверждено',
  contradicted: 'опровергается',
};
const VERIFICATION_RU = {
  unverified: 'не проверено', partially_verified: 'частично проверено',
  verified: 'проверено', refuted: 'опровергнуто', contradicted: 'опровергается',
};
const HYP_TYPE_RU = {
  primary: 'основная', alternative: 'альтернативная', exculpatory: 'оправдывающая',
  procedural: 'процедурная', accounting_error: 'учётная ошибка',
  technical_error: 'техническая ошибка', unknown: 'неопределённая',
};
const HYP_STATUS_RU = {
  active: 'проверяется', supported: 'подтверждена', weakened: 'ослаблена',
  contradicted: 'опровергнута', eliminated: 'исключена', unresolved: 'не разрешена',
};
const APPROVAL_RU = {
  interview_dispatch: 'Отправка интервью участникам',
  sensitive_question: 'Чувствительный вопрос',
  subject_designation: 'Перевод человека в статус subject',
  hypothesis_closure: 'Исключение версии',
  finding_approval: 'Утверждение вывода',
  final_report_release: 'Выпуск итогового отчёта',
};

/** Краткое содержание запроса: без него человек утверждает вслепую. */
function describeApproval(a) {
  const payload = a.payload || {};
  if (payload.people) {
    return 'раунд ' + (payload.round || '?') + ', человек: ' + payload.people.length
      + ', чувствительных вопросов: '
      + payload.people.reduce(function (sum, p) { return sum + (p.sensitive_questions || 0); }, 0);
  }
  if (payload.interview_ids) return 'интервью: ' + payload.interview_ids.length;
  return a.object_type + (a.object_id ? ' ' + a.object_id : '');
}

const CONTRADICTION_TYPE_RU = {
  direct: 'прямое', temporal: 'по времени', financial: 'по суммам', location: 'по месту',
  identity: 'по участникам', sequence: 'по последовательности',
  documentary: 'с документом', partial: 'частичное',
};
const PARTICIPANT_RU = {
  subject: 'в отношении кого ведётся', witness: 'свидетель', reporter: 'заявитель',
  manager: 'руководитель', victim: 'потерпевший', customer: 'клиент',
  external: 'внешнее лицо', investigator: 'следователь', unknown: 'роль не определена',
};
const STAGE_RU = {
  intake: 'приём заявления', planning: 'планирование', evidence_collection: 'сбор доказательств',
  interview_round: 'раунд интервью', analysis: 'анализ', adversarial_review: 'независимая проверка',
  follow_up: 'дообследование', reporting: 'подготовка отчёта', closed: 'закрыто',
};
const CASE_STATUS_RU = {
  draft: 'черновик', intake: 'приём заявления', planning: 'планирование',
  evidence_collection: 'сбор доказательств', interviews: 'интервью', analysis: 'анализ',
  follow_up: 'дообследование', review: 'проверка', completed: 'завершено', archived: 'в архиве',
};
const SEVERITY_RU = { low: 'низкая', medium: 'средняя', high: 'высокая', critical: 'критическая' };
const PRECISION_RU = {
  exact: 'точно', minute: 'до минуты', hour: 'до часа', part_of_day: 'часть суток',
  day: 'день', week: 'неделя', month: 'месяц', range: 'интервал', unknown: 'неизвестно',
};

function chipClass(kind, value) {
  if (kind === 'corroboration') {
    if (value === 'independently_corroborated') return 'chip ok';
    if (value === 'contradicted') return 'chip danger';
    if (value === 'uncorroborated') return 'chip warn';
  }
  if (kind === 'verification') {
    if (value === 'verified') return 'chip ok';
    if (value === 'refuted' || value === 'contradicted') return 'chip danger';
    if (value === 'unverified') return 'chip warn';
  }
  if (kind === 'severity') {
    if (value === 'critical') return 'chip danger';
    if (value === 'high') return 'chip warn';
  }
  return 'chip';
}

/** Время выводится ровно с той точностью, с какой оно установлено. */
function formatMoment(start, end, precision) {
  if (!start && !end) return 'время неизвестно';
  const fmt = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit' });
  };
  if (precision === 'exact') return fmt(start);
  if (start && end && start !== end) {
    const a = new Date(start);
    const b = new Date(end);
    const sameDay = !isNaN(a.getTime()) && !isNaN(b.getTime())
      && a.toDateString() === b.toDateString();
    if (sameDay) {
      const date = a.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = function (d) { return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
      // Сутки целиком — это «24.08.2026», а не «между 00:00 и 00:00»: интервал,
      // покрывающий весь день, читается как дата, а не как уточнение времени.
      const wholeDay = time(a) === '00:00' && time(b) === '00:00';
      return wholeDay ? date : date + ', между ' + time(a) + ' и ' + time(b);
    }
    return 'между ' + fmt(start) + ' и ' + fmt(end);
  }
  return 'около ' + fmt(start || end);
}

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined) return '—';
  return Number(amount).toLocaleString('ru-RU') + (currency ? ' ' + currency : '');
}
`;

const SCRIPT_VIEWS = `
// ─────────────────────────── Экраны ───────────────────────────

const TABS = [
  { id: 'overview', title: 'Обзор' },
  { id: 'timeline', title: 'Хронология' },
  { id: 'matrix', title: 'Доказательства' },
  { id: 'contradictions', title: 'Противоречия' },
  { id: 'hypotheses', title: 'Версии' },
  { id: 'money', title: 'Движение средств' },
  { id: 'report', title: 'Выводы и отчёт' },
];

function loading() {
  return el('p', { class: 'empty', text: 'Загружаю…' });
}
function empty(text) {
  return el('p', { class: 'empty', text: text });
}

/** §43 ТЗ: заголовок дела, открытые вопросы, противоречия, версии, следующее действие. */
async function viewOverview(root) {
  setChildren(root, [loading()]);
  const data = await api('/api/cases/' + state.caseId + '/dashboard');
  state.caseInfo = data.case;

  const counters = el('div', { class: 'grid' }, [
    el('div', { class: 'card' }, [
      el('h3', { text: 'Стадия' }),
      el('div', { class: 'stat', text: STAGE_RU[data.case.current_stage] || data.case.current_stage || '—' }),
      el('div', { class: 'muted', text: 'статус: ' + (CASE_STATUS_RU[data.case.status] || data.case.status || '—') }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: 'Открытые вопросы' }),
      el('div', { class: 'stat', text: String(data.open_issues.length) }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: 'Критические противоречия' }),
      el('div', { class: 'stat', text: String(data.critical_contradictions.length) }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: 'Активные версии' }),
      el('div', { class: 'stat', text: String(data.active_hypotheses.length) }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: 'Неподтверждённые переводы' }),
      el('div', { class: 'stat', text: String(data.unverified_money_flows.length) }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: 'Ждут утверждения' }),
      el('div', { class: 'stat', text: String(data.pending_approvals.length) }),
    ]),
  ]);

  const actions = data.recommended_next_actions.length === 0
    ? empty('Рекомендованных действий нет')
    : el('div', {}, data.recommended_next_actions.slice(0, 8).map(function (a) {
      return el('div', { class: 'card', style: 'margin-bottom:.6rem' }, [
        el('div', {}, [
          el('strong', { text: a.action }),
          ' ',
          el('span', { class: chipClass('severity', a.priority), text: 'приоритет: ' + (SEVERITY_RU[a.priority] || a.priority) }),
          ' ',
          el('span', { class: 'chip', text: 'прирост: ' + (CONFIDENCE_RU[a.expected_information_gain] || a.expected_information_gain) }),
          a.requires_human_approval ? el('span', { class: 'chip warn', text: ' требует утверждения' }) : null,
        ]),
        el('div', { class: 'muted', text: a.reason }),
      ]);
    }));

  // Действия предлагаются по стадии дела: показывать «составить план» до разбора
  // заявления значит предлагать планировать расследование неизвестно чего.
  const stage = data.case.current_stage;
  const stageActions = el('div', { class: 'filters' }, [
    stage === 'intake' ? action('Разобрать заявление', function () {
      return api('/api/cases/' + state.caseId + '/intake', { method: 'POST', body: {} });
    }) : null,
    (stage === 'intake' || stage === 'planning') ? action('Составить план расследования', function () {
      return api('/api/cases/' + state.caseId + '/plan', { method: 'POST', body: {} });
    }) : null,
    action('Запустить аналитический цикл', async function () {
      const result = await api('/api/cases/' + state.caseId + '/analysis', { method: 'POST', body: {} });
      return { message: result.job_id
        ? 'Поставлено в очередь. Цикл дойдёт до пересмотра версий и остановится на утверждении человеком.'
        : 'Цикл выполнен.', reload: true };
    }, { ghost: true }),
    action('Классифицировать выводы', function () {
      return api('/api/cases/' + state.caseId + '/final-review', { method: 'POST', body: {} });
    }, { ghost: true }),
  ]);

  const approvals = data.pending_approvals.length === 0 ? null : el('div', {}, [
    el('h2', { text: 'Ждут вашего решения' }),
    el('div', {}, data.pending_approvals.map(function (a) {
      return el('div', { class: 'card', style: 'margin-bottom:.6rem' }, [
        el('div', {}, [
          el('strong', { text: APPROVAL_RU[a.approval_type] || a.approval_type }), ' ',
          el('span', { class: 'chip warn', text: 'решение не принято' }),
        ]),
        a.payload ? el('div', { class: 'muted', text: describeApproval(a) }) : null,
        el('div', { class: 'filters' }, [
          noteAction('Утвердить', 'что именно проверено', function (note) {
            return api('/api/cases/' + state.caseId + '/approvals/' + a.id + '/decide',
              { method: 'POST', body: { decision: 'approved', note: note } });
          }),
          noteAction('Отклонить', 'почему отклонено', function (note) {
            return api('/api/cases/' + state.caseId + '/approvals/' + a.id + '/decide',
              { method: 'POST', body: { decision: 'rejected', note: note } });
          }, { ghost: true }),
        ]),
      ]);
    })),
  ]);

  const people = data.persons.length === 0 ? empty('Участники не добавлены')
    : el('div', { class: 'scroll' }, [el('table', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Участник' }), el('th', { text: 'Должность' }),
        el('th', { text: 'Роль в деле' }), el('th', { text: 'Отношение к событиям' }),
        el('th', { text: 'Действие' }),
      ])),
      el('tbody', {}, data.persons.map(function (p) {
        return el('tr', {}, [
          el('td', { text: p.name }),
          el('td', { text: p.job_title || '—' }),
          el('td', {}, [el('span', { class: 'chip', text: PARTICIPANT_RU[p.participant_type] || p.participant_type })]),
          el('td', { class: 'muted', text: p.relationship_to_incident || '—' }),
          el('td', {}, [action('Подготовить интервью', function () {
            return api('/api/cases/' + state.caseId + '/interviews',
              { method: 'POST', body: { personId: p.id } });
          }, { ghost: true })].concat((p.interviews || []).map(interviewRow))),
        ]);
      })),
    ])]);

  setChildren(root, [
    el('h1', { text: data.case.title }),
    el('p', { class: 'muted', text: data.case.case_number + ' · ' + (data.case.description || '') }),
    counters,
    el('h2', { text: 'Действия по делу' }),
    stageActions,
    approvals,
    el('h2', { text: 'Что делать дальше' }),
    actions,
    el('h2', { text: 'Участники' }),
    people,
  ]);
}


/**
 * Состояние интервью и то, что с ним можно сделать прямо сейчас.
 *
 * Порядок действий повторяет §42: сначала человек утверждает отправку, только потом
 * выдаётся персональная ссылка, и лишь отдельным решением открываются чувствительные
 * вопросы. Показывается и то, сколько вопросов дошло до участника: интервью с
 * утверждённой отправкой и нулём открытых вопросов — это ссылка на пустой экран.
 */
function interviewRow(i) {
  var state_ru = { planned: 'подготовлено', invited: 'ссылка выдана', in_progress: 'идёт',
    completed: 'завершено', cancelled: 'отменено', declined: 'отказ' };
  var parts = [
    el('span', { class: 'chip', text: 'раунд ' + i.round + ' · ' + (state_ru[i.status] || i.status) }),
    el('span', { class: 'muted', text: ' вопросов: ' + i.questions_open + ' из ' + i.questions_total }),
  ];

  if (!i.dispatch_approved) {
    parts.push(action('Запросить отправку', function () {
      return api('/api/cases/' + state.caseId + '/interviews/dispatch-approval',
        { method: 'POST', body: { interviewIds: [i.id] } })
        .then(function () { return { message: 'Запрос ушёл на утверждение.', reload: true }; });
    }, { ghost: true }));
  } else {
    parts.push(action('Выдать ссылку участнику', function () {
      return api('/api/cases/' + state.caseId + '/interviews/' + i.id + '/link',
        { method: 'POST', body: { baseUrl: location.origin } })
        .then(function (r) {
          return { message: 'Ссылка показывается один раз:', link: r.url, reload: false };
        });
    }, { ghost: true }));
  }

  if (i.questions_sensitive_pending > 0) {
    parts.push(el('span', { class: 'muted',
      text: ' закрыто чувствительных вопросов: ' + i.questions_sensitive_pending }));
  }

  return el('div', { class: 'stack' }, parts);
}

/** §44 ТЗ: хронология с фильтрами; конкурирующие версии времени видны сразу. */
async function viewTimeline(root) {
  setChildren(root, [loading()]);
  const data = await api('/api/cases/' + state.caseId + '/timeline');

  if (data.events.length === 0) {
    root.replaceChildren(el('h1', { text: 'Хронология' }),
      empty('События появятся после разбора показаний'));
    return;
  }

  const search = el('input', { type: 'search', placeholder: 'Поиск по описанию' });
  const onlyCompeting = el('input', { type: 'checkbox', id: 'competing' });
  const list = el('div', {});

  function draw() {
    const query = search.value.trim().toLowerCase();
    const items = data.events.filter(function (e) {
      if (onlyCompeting.checked && (e.competing_versions || []).length === 0) return false;
      if (!query) return true;
      return (e.description || '').toLowerCase().includes(query)
        || (e.participants || []).join(' ').toLowerCase().includes(query);
    });

    if (items.length === 0) { list.replaceChildren(empty('Ничего не найдено')); return; }

    list.replaceChildren.apply(list, items.map(function (e) {
      const competing = e.competing_versions || [];
      return el('div', { class: 'timeline-item' + (competing.length ? ' competing' : '') }, [
        el('div', {}, [
          el('span', { class: 'chip', text: e.code }), ' ',
          el('strong', { text: formatMoment(e.start_at, e.end_at, e.time_precision) }), ' ',
          el('span', { class: 'chip', text: 'точность: ' + (PRECISION_RU[e.time_precision] || e.time_precision) }), ' ',
          el('span', { class: 'chip', text: 'уверенность: ' + (CONFIDENCE_RU[e.confidence] || e.confidence) }),
          competing.length ? el('span', { class: 'chip warn', text: 'есть другая версия времени: ' + competing.length }) : null,
        ]),
        el('div', { text: e.description }),
        e.participants.length ? el('div', { class: 'muted', text: 'участники: ' + e.participants.join(', ') }) : null,
        el('details', {}, [
          el('summary', { text: 'источники и подтверждение' }),
          el('ul', { class: 'plain' }, e.source_claims.map(function (c) {
            return el('li', {}, [
              el('span', { class: 'chip', text: c.code }), ' ',
              c.statement + ' — ',
              el('span', { class: chipClass('corroboration', c.corroboration_status),
                text: CORROBORATION_RU[c.corroboration_status] || c.corroboration_status }),
              c.said_by ? el('span', { class: 'muted', text: ' (со слов: ' + c.said_by + ')' }) : null,
            ]);
          })),
          competing.length ? el('div', {}, [
            el('strong', { text: 'Конкурирующие версии времени' }),
            el('ul', { class: 'plain' }, competing.map(function (v) {
              return el('li', { text: formatMoment(v.start_at, v.end_at, v.time_precision) + ' — ' + (v.note || '') });
            })),
          ]) : null,
        ]),
      ]);
    }));
  }

  search.addEventListener('input', draw);
  onlyCompeting.addEventListener('change', draw);
  draw();

  setChildren(root, [
    el('h1', { text: 'Хронология' }),
    el('p', { class: 'muted', text: 'Событие с несколькими версиями времени отмечено отдельно: '
      + 'система не выбирает одну версию за следователя.' }),
    el('div', { class: 'filters' }, [
      search,
      el('label', { for: 'competing' }, [onlyCompeting, ' только с конкурирующими версиями']),
    ]),
    list,
  ]);
}

/** §45 ТЗ: матрица доказательств с поиском, фильтрами и переходом к оригиналу. */
async function viewMatrix(root) {
  setChildren(root, [loading()]);
  const data = await api('/api/cases/' + state.caseId + '/matrix');

  if (data.rows.length === 0) {
    root.replaceChildren(el('h1', { text: 'Доказательства' }),
      empty('Утверждения появятся после разбора показаний и материалов'));
    return;
  }

  const search = el('input', { type: 'search', placeholder: 'Поиск по утверждению, человеку, коду' });
  const statusFilter = el('select', {}, [
    el('option', { value: '', text: 'Любое подтверждение' }),
  ].concat(Object.keys(CORROBORATION_RU).map(function (key) {
    return el('option', { value: key, text: CORROBORATION_RU[key] });
  })));
  const onlyContradicted = el('input', { type: 'checkbox', id: 'contra' });

  const body = el('tbody', {});
  const counter = el('span', { class: 'muted' });

  function draw() {
    const query = search.value.trim().toLowerCase();
    const rows = data.rows.filter(function (r) {
      if (statusFilter.value && r.corroboration_status !== statusFilter.value) return false;
      if (onlyContradicted.checked && r.contradicting.length === 0) return false;
      if (!query) return true;
      return (r.statement || '').toLowerCase().includes(query)
        || (r.person || '').toLowerCase().includes(query)
        || r.claim_code.toLowerCase().includes(query);
    });

    counter.textContent = 'показано ' + rows.length + ' из ' + data.rows.length;

    body.replaceChildren.apply(body, rows.map(function (r) {
      return el('tr', {}, [
        el('td', {}, [el('span', { class: 'chip', text: r.claim_code })]),
        el('td', {}, [
          el('div', { text: r.statement }),
          r.amount !== null && r.amount !== undefined
            ? el('div', { class: 'muted', text: formatMoney(r.amount, r.currency) }) : null,
          r.time_start || r.time_end
            ? el('div', { class: 'muted', text: formatMoment(r.time_start, r.time_end, r.time_precision) }) : null,
        ]),
        el('td', { text: r.person || '—' }),
        el('td', {}, r.supporting.length === 0 ? [el('span', { class: 'muted', text: '—' })]
          : r.supporting.map(function (s) {
            return el('div', {}, [
              el('span', { class: 'chip ok', text: s.code || '?' }),
              el('span', { class: 'muted', text: ' ' + (s.relation === 'partially_supports' ? 'частично' : 'подтверждает') }),
            ]);
          })),
        // Опровергающее доказательство стоит рядом с подтверждающим и никогда
        // не прячется за фильтром: скрыть его значило бы исказить картину.
        el('td', {}, r.contradicting.length === 0 ? [el('span', { class: 'muted', text: '—' })]
          : r.contradicting.map(function (s) {
            return el('div', {}, [el('span', { class: 'chip danger', text: s.code || '?' }),
              el('span', { class: 'muted', text: ' опровергает' })]);
          })),
        el('td', {}, [
          el('div', {}, [el('span', { class: chipClass('corroboration', r.corroboration_status),
            text: CORROBORATION_RU[r.corroboration_status] || r.corroboration_status })]),
          el('div', {}, [el('span', { class: chipClass('verification', r.verification_status),
            text: VERIFICATION_RU[r.verification_status] || r.verification_status })]),
        ]),
        el('td', {}, r.source ? [
          el('div', { class: 'muted', text: r.source.title || r.source.type }),
          el('div', { class: 'muted', text: describeLocator(r.source.locator) }),
        ] : [el('span', { class: 'muted', text: 'источник не указан' })]),
      ]);
    }));
  }

  search.addEventListener('input', draw);
  statusFilter.addEventListener('change', draw);
  onlyContradicted.addEventListener('change', draw);
  draw();

  setChildren(root, [
    el('h1', { text: 'Доказательства' }),
    el('p', { class: 'muted', text: 'Опровергающее доказательство показывается рядом с подтверждающим.' }),
    el('div', { class: 'filters' }, [
      search, statusFilter,
      el('label', { for: 'contra' }, [onlyContradicted, ' только опровергаемые']),
      counter,
    ]),
    el('div', { class: 'scroll' }, [el('table', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Код' }), el('th', { text: 'Утверждение' }), el('th', { text: 'Кто' }),
        el('th', { text: 'Подтверждает' }), el('th', { text: 'Опровергает' }),
        el('th', { text: 'Состояние' }), el('th', { text: 'Оригинал' }),
      ])),
      body,
    ])]),
  ]);
}

/** Описание места в оригинале: без него строка матрицы недоказуема. */
function describeLocator(locator) {
  if (!locator) return 'место не указано';
  if (locator.page) return 'стр. ' + locator.page;
  if (locator.row_id) return 'строка ' + locator.row_id;
  if (locator.message_id) return 'сообщение ' + locator.message_id;
  if (locator.line) return 'строка ' + locator.line;
  if (locator.timestamp) return 'запись ' + locator.timestamp;
  if (locator.char_start !== null && locator.char_start !== undefined) {
    return 'символы ' + locator.char_start + '–' + locator.char_end;
  }
  return 'место не указано';
}
`;

const SCRIPT_VIEWS2 = `
/** §46 ТЗ: карточка противоречия — обе стороны, независимое доказательство, проверки. */
async function viewContradictions(root) {
  setChildren(root, [loading()]);
  const data = await api('/api/cases/' + state.caseId + '/contradictions');

  if (data.contradictions.length === 0) {
    root.replaceChildren(el('h1', { text: 'Противоречия' }),
      empty('Противоречий не найдено. Это не значит, что их нет: анализ идёт по мере поступления показаний.'));
    return;
  }

  function sideBlock(title, side) {
    if (!side) return el('div', { class: 'muted', text: title + ': утверждение не найдено' });
    return el('div', {}, [
      el('div', {}, [el('strong', { text: title }), ' ', el('span', { class: 'chip', text: side.code })]),
      el('div', { text: side.statement }),
      el('div', { class: 'muted', text: side.said_by ? 'со слов: ' + side.said_by : 'источник не назван' }),
      el('div', {}, [el('span', { class: chipClass('corroboration', side.corroboration_status),
        text: CORROBORATION_RU[side.corroboration_status] || side.corroboration_status })]),
    ]);
  }

  const cards = data.contradictions.map(function (c) {
    return el('div', { class: 'card', style: 'margin-bottom:.9rem' }, [
      el('div', {}, [
        el('span', { class: 'chip', text: c.code }), ' ',
        el('span', { class: chipClass('severity', c.severity), text: 'важность: ' + (SEVERITY_RU[c.severity] || c.severity) }), ' ',
        el('span', { class: 'chip', text: 'тип: ' + (CONTRADICTION_TYPE_RU[c.type] || c.type) }), ' ',
        el('span', { class: c.resolution_status === 'open' ? 'chip warn' : 'chip ok',
          text: c.resolution_status === 'open' ? 'открыто' : c.resolution_status }),
      ]),
      el('h3', { text: c.description }),
      el('div', { class: 'grid' }, [
        el('div', { class: 'card' }, [sideBlock('Сторона А', c.claim_a)]),
        el('div', { class: 'card' }, [sideBlock('Сторона Б', c.claim_b)]),
      ]),
      // Отсутствие независимого доказательства — важный факт, а не пустое место:
      // именно оно объясняет, почему противоречие не разрешается само.
      el('div', { style: 'margin-top:.6rem' }, [
        el('strong', { text: 'Независимое доказательство: ' }),
        c.independent_evidence.length === 0
          ? el('span', { class: 'chip warn', text: 'нет' })
          : el('span', { text: c.independent_evidence.join(', ') }),
      ]),
      c.recommended_checks.length ? el('details', {}, [
        el('summary', { text: 'что может разрешить противоречие' }),
        el('ul', { class: 'plain' }, c.recommended_checks.map(function (t) { return el('li', { text: t }); })),
      ]) : null,
      // Закрыть противоречие может только человек и только с объяснением: помеченное
      // разрешённым без причины, оно исчезает из поля зрения, не будучи разрешённым.
      c.resolution_status === 'open' ? el('div', { style: 'margin-top:.6rem' }, [
        noteAction('Разрешено', 'чем именно разрешено', function (note) {
          return api('/api/cases/' + state.caseId + '/contradictions/' + c.id + '/resolve',
            { method: 'POST', body: { status: 'resolved', note: note } });
        }),
        noteAction('Неразрешимо', 'почему разрешить невозможно', function (note) {
          return api('/api/cases/' + state.caseId + '/contradictions/' + c.id + '/resolve',
            { method: 'POST', body: { status: 'unresolvable', note: note } });
        }, { ghost: true }),
      ]) : el('div', { class: 'muted', style: 'margin-top:.6rem',
        text: c.resolution_note ? 'Решение: ' + c.resolution_note : '' }),
    ]);
  });

  setChildren(root, [el('h1', { text: 'Противоречия' }), el('div', {}, cards)]);
}

/** §47 ТЗ: доска версий по колонкам состояний с историей и обеими проверками. */
async function viewHypotheses(root) {
  setChildren(root, [loading()]);
  const data = await api('/api/cases/' + state.caseId + '/hypotheses');

  if (data.hypotheses.length === 0) {
    setChildren(root, [el('h1', { text: 'Версии' }), empty('Версии появятся после планирования расследования')]);
    return;
  }

  const columns = ['active', 'supported', 'weakened', 'contradicted', 'eliminated'];
  const board = el('div', { class: 'board' }, columns.map(function (status) {
    const items = data.hypotheses.filter(function (h) { return h.status === status; });
    return el('section', {}, [
      el('h3', { text: (HYP_STATUS_RU[status] || status) + ' · ' + items.length }),
      items.length === 0 ? el('div', { class: 'muted', text: '—' })
        : el('div', {}, items.map(function (h) {
          return el('div', { class: 'hyp' }, [
            el('div', {}, [
              el('span', { class: 'chip', text: h.code }), ' ',
              el('span', { class: 'chip', text: HYP_TYPE_RU[h.type] || h.type }), ' ',
              el('span', { class: 'chip', text: 'уверенность: ' + (CONFIDENCE_RU[h.confidence] || h.confidence) }),
            ]),
            el('div', { text: h.description }),
            h.missing_evidence.length ? el('details', {}, [
              el('summary', { text: 'чего не хватает (' + h.missing_evidence.length + ')' }),
              el('ul', { class: 'plain' }, h.missing_evidence.map(function (m) { return el('li', { text: m }); })),
            ]) : null,
            el('details', {}, [
              el('summary', { text: 'чем подтвердится и чем опровергнется' }),
              el('div', { class: 'muted', text: 'Подтвердит:' }),
              el('ul', { class: 'plain' }, h.evidence_that_would_support.map(function (m) { return el('li', { text: m }); })),
              el('div', { class: 'muted', text: 'Опровергнет:' }),
              el('ul', { class: 'plain' }, h.evidence_that_would_contradict.map(function (m) { return el('li', { text: m }); })),
            ]),
            h.red_team ? el('details', {}, [
              el('summary', { text: 'независимая проверка (Red Team)' }),
              el('div', { text: 'Вывод: ' + h.red_team.verdict }),
              el('div', { class: 'muted', text: h.red_team.verdict_reason || '' }),
              el('ul', { class: 'plain' }, (h.red_team.alternatives || []).map(function (a) {
                return el('li', { text: a.description });
              })),
            ]) : null,
            // История статусов защищает от ретроспективного искажения: видно,
            // что версия не «всегда была такой».
            h.history.length ? el('details', {}, [
              el('summary', { text: 'история статусов (' + h.history.length + ')' }),
              el('ul', { class: 'plain' }, h.history.map(function (r) {
                return el('li', { text: (r.from || '—') + ' → ' + (HYP_STATUS_RU[r.to] || r.to) + ': ' + (r.reason || '') });
              })),
            ]) : null,
          ]);
        })),
    ]);
  }));

  const unresolved = data.hypotheses.filter(function (h) { return h.status === 'unresolved'; });

  setChildren(root, [
    el('h1', { text: 'Версии' }),
    el('p', { class: 'muted', text: 'Опровергнутая версия остаётся в деле: её исключение — решение человека.' }),
    board,
    unresolved.length ? el('div', {}, [
      el('h2', { text: 'Не разрешены' }),
      el('div', {}, unresolved.map(function (h) {
        return el('div', { class: 'card', style: 'margin-bottom:.6rem' }, [
          el('span', { class: 'chip', text: h.code }), ' ', h.description,
        ]);
      })),
    ]) : null,
  ]);
}

/** §19, §33 ТЗ: ожидаемая и фактическая цепочки движения средств рядом. */
async function viewMoney(root) {
  setChildren(root, [loading()]);
  const data = await api('/api/cases/' + state.caseId + '/money-flow');

  if (data.expected.length === 0 && data.actual.length === 0) {
    root.replaceChildren(el('h1', { text: 'Движение средств' }),
      empty('Финансовый разбор ещё не проводился'));
    return;
  }

  function chain(title, rows, note) {
    return el('div', {}, [
      el('h2', { text: title }),
      note ? el('p', { class: 'muted', text: note }) : null,
      rows.length === 0 ? empty('нет данных') : el('div', { class: 'scroll' }, [el('table', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', { text: '№' }), el('th', { text: 'От кого' }), el('th', { text: 'Кому' }),
          el('th', { text: 'Сумма' }), el('th', { text: 'Когда' }), el('th', { text: 'Состояние' }),
          el('th', { text: 'Основание' }),
        ])),
        el('tbody', {}, rows.map(function (e) {
          return el('tr', {}, [
            el('td', { text: String(e.sequence ?? '') }),
            el('td', { text: e.from }),
            el('td', { text: e.to }),
            el('td', { text: formatMoney(e.amount, e.currency) }),
            el('td', { text: formatMoment(e.occurred_at, null, e.time_precision || 'unknown') }),
            el('td', {}, [el('span', { class: chipClass('verification', e.verification_status),
              text: VERIFICATION_RU[e.verification_status] || e.verification_status })]),
            el('td', { class: 'muted', text: e.notes || (e.evidence_count ? 'доказательств: ' + e.evidence_count : '—') }),
          ]);
        })),
      ])]),
    ]);
  }

  const unverified = data.actual.filter(function (e) { return e.verification_status === 'unverified'; });

  setChildren(root, [
    el('h1', { text: 'Движение средств' }),
    unverified.length ? el('p', {}, [
      el('span', { class: 'chip warn', text: 'неподтверждённых звеньев: ' + unverified.length }),
      el('span', { class: 'muted', text: ' звено, известное только со слов, не является фактом' }),
    ]) : null,
    chain('Как должно было пройти', data.expected,
      'Норматив, а не наблюдение: подтверждённым это движение быть не может.'),
    chain('Как прошло по материалам', data.actual, null),
  ]);
}
`;

const SCRIPT_BOOT = `
/** Выводы и отчёт: видно, что установлено, что заявлено и что осталось неизвестным. */
async function viewReport(root) {
  setChildren(root, [loading()]);
  const [findings, reports] = await Promise.all([
    api('/api/cases/' + state.caseId + '/findings'),
    api('/api/cases/' + state.caseId + '/reports'),
  ]);

  const TYPE_RU = {
    fact: 'установленный факт', corroborated_claim: 'подтверждённое утверждение',
    inference: 'вывод', unresolved: 'не разрешено',
    procedural_failure: 'сбой процедуры', root_cause: 'корневая причина',
  };
  const REVIEW_RU = { draft: 'черновик', under_review: 'на проверке', approved: 'утверждён', rejected: 'отклонён' };

  const list = findings.findings.length === 0 ? empty('Выводов пока нет')
    : el('div', { class: 'scroll' }, [el('table', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Код' }), el('th', { text: 'Вывод' }), el('th', { text: 'Тип' }),
        el('th', { text: 'Уверенность' }), el('th', { text: 'Состояние' }),
        el('th', { text: 'Решение' }), el('th', { text: 'Защитная проверка' }),
      ])),
      el('tbody', {}, findings.findings.map(function (f) {
        return el('tr', {}, [
          el('td', {}, [el('span', { class: 'chip', text: f.finding_code })]),
          el('td', {}, [
            el('div', { text: f.statement }),
            (f.alternative_explanations || []).length ? el('details', {}, [
              el('summary', { text: 'альтернативные объяснения' }),
              el('ul', { class: 'plain' }, f.alternative_explanations.map(function (a) {
                return el('li', { text: a });
              })),
            ]) : null,
          ]),
          el('td', {}, [el('span', { class: f.finding_type === 'fact' ? 'chip ok' : 'chip',
            text: TYPE_RU[f.finding_type] || f.finding_type })]),
          el('td', { text: CONFIDENCE_RU[f.confidence] || f.confidence || '—' }),
          el('td', {}, [el('span', { class: f.review_status === 'approved' ? 'chip ok' : 'chip',
            text: REVIEW_RU[f.review_status] || f.review_status })]),
          el('td', {}, f.review_status === 'draft' || f.review_status === 'under_review'
            ? [
              noteAction('Утвердить', 'что проверено', function (note) {
                return api('/api/cases/' + state.caseId + '/findings/' + f.id + '/approve',
                  { method: 'POST', body: { note: note } });
              }),
              noteAction('Отклонить', 'почему', function (note) {
                return api('/api/cases/' + state.caseId + '/findings/' + f.id + '/reject',
                  { method: 'POST', body: { note: note } });
              }, { ghost: true }),
            ]
            : [el('span', { class: 'muted', text: '—' })]),
          el('td', {}, f.defence_review_verdict
            ? [el('span', { class: f.defence_review_verdict === 'conclusions_should_not_stand' ? 'chip danger' : 'chip warn',
              text: f.defence_review_verdict === 'conclusions_hold' ? 'выдерживает'
                : (f.defence_review_verdict === 'conclusions_should_not_stand' ? 'не выдерживает' : 'нужны материалы') })]
            : [el('span', { class: 'muted', text: 'не проводилась' })]),
        ]);
      })),
    ])]);

  const reportBlocks = reports.reports.length === 0 ? empty('Отчёт ещё не составлен')
    : el('div', {}, reports.reports.map(function (r) {
      return el('div', { class: 'card', style: 'margin-bottom:.6rem' }, [
        el('div', {}, [
          el('strong', { text: r.title || ('Версия ' + r.version) }), ' ',
          el('span', { class: r.status === 'released' ? 'chip ok' : 'chip', text: r.status }),
        ]),
        el('div', { class: 'muted', text: 'выводов: ' + (r.cited_finding_codes || []).length
          + ', неразрешённых вопросов: ' + (r.unresolved_questions || []).length }),
        r.sections ? el('details', {}, [
          el('summary', { text: 'краткое изложение' }),
          el('ul', { class: 'plain' }, (r.sections.executive_summary || []).map(function (s) {
            return el('li', { text: s.text + ' [' + (s.finding_codes || []).join(', ') + ']' });
          })),
        ]) : null,
      ]);
    }));

  const approvedCount = findings.findings.filter(function (f) { return f.review_status === 'approved'; }).length;
  const draftReport = reports.reports.find(function (r) { return r.status === 'draft'; });

  const reportActions = el('div', { class: 'filters' }, [
    action('Составить отчёт', function () {
      return api('/api/cases/' + state.caseId + '/report', { method: 'POST', body: {} });
    }),
    draftReport ? action('Запросить выпуск', function () {
      return api('/api/cases/' + state.caseId + '/reports/' + draftReport.id + '/request-release',
        { method: 'POST', body: {} });
    }, { ghost: true }) : null,
    draftReport ? action('Выпустить отчёт', async function () {
      await api('/api/cases/' + state.caseId + '/reports/' + draftReport.id + '/release',
        { method: 'POST', body: {} });
      return { message: 'Отчёт выпущен, дело закрыто.', reload: true };
    }, { ghost: true }) : null,
  ]);

  setChildren(root, [
    el('h1', { text: 'Выводы и отчёт' }),
    el('p', { class: 'muted', text: 'Установленный факт всегда имеет ссылку на доказательство; '
      + 'неразрешённые вопросы не сокращаются ради связности.' }),
    list,
    el('h2', { text: 'Отчёты' }),
    // Отчёт составляется только из утверждённых выводов, поэтому счётчик стоит
    // рядом с кнопкой: иначе отказ «нет утверждённых выводов» выглядит как поломка.
    el('p', { class: 'muted', text: 'Утверждённых выводов: ' + approvedCount
      + ' из ' + findings.findings.length + '. Выпуск отчёта требует утверждения человеком '
      + 'и закрывает дело.' }),
    reportActions,
    reportBlocks,
  ]);
}

// ─────────────────────────── Маршрутизация ───────────────────────────

const VIEWS = {
  overview: viewOverview, timeline: viewTimeline, matrix: viewMatrix,
  contradictions: viewContradictions, hypotheses: viewHypotheses,
  money: viewMoney, report: viewReport,
};

async function viewCaseList(root) {
  setChildren(root, [loading()]);
  const data = await api('/api/cases');
  if (data.cases.length === 0) {
    setChildren(root, [el('h1', { text: 'Дела' }), empty('Дел пока нет')]);
    return;
  }
  setChildren(root, [
    el('h1', { text: 'Дела' }),
    el('div', { class: 'scroll' }, [el('table', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Номер' }), el('th', { text: 'Название' }),
        el('th', { text: 'Стадия' }), el('th', { text: 'Статус' }),
      ])),
      el('tbody', {}, data.cases.map(function (c) {
        return el('tr', {}, [
          el('td', {}, [el('a', { href: '#/case/' + c.id + '/overview', text: c.case_number })]),
          el('td', { text: c.title }),
          el('td', { text: STAGE_RU[c.current_stage] || c.current_stage || '—' }),
          el('td', {}, [el('span', { class: 'chip', text: CASE_STATUS_RU[c.status] || c.status })]),
        ]);
      })),
    ])]),
  ]);
}

function viewLogin(root) {
  const email = el('input', { type: 'text', autocomplete: 'username' });
  const password = el('input', { type: 'password', autocomplete: 'current-password' });
  const status = el('div', { class: 'error' });
  const button = el('button', { type: 'submit', text: 'Войти' });

  const form = el('form', { class: 'card login', onsubmit: async function (event) {
    event.preventDefault();
    button.disabled = true;
    status.textContent = '';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.value, password: password.value }),
      });
      const payload = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(payload.error || 'Не удалось войти');
      state.token = payload.token;
      state.user = payload.user;
      writeToken(payload.token);
      render();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  } }, [
    el('h1', { text: 'Investigation Workspace' }),
    el('p', { class: 'muted', text: 'Вход для сотрудников, ведущих разбирательство.' }),
    el('label', { text: 'Адрес' }), email,
    el('label', { text: 'Пароль' }), password,
    el('div', { style: 'margin-top:1rem' }, [button]),
    status,
  ]);

  setChildren(root, [form]);
}

function parseHash() {
  const parts = (location.hash || '').replace(/^#\\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'case' && parts[1]) {
    return { caseId: parts[1], tab: parts[2] || 'overview' };
  }
  return { caseId: null, tab: null };
}

async function render() {
  const app = document.getElementById('app');
  if (!state.token) { setChildren(app, []); viewLogin(app); return; }

  const route = parseHash();
  state.caseId = route.caseId;

  const caseTitle = el('span', { class: 'case-name',
    text: state.caseInfo && route.caseId
      ? state.caseInfo.case_number + ' · ' + state.caseInfo.title : '' });

  const header = el('header', { class: 'top' }, [
    el('a', { href: '#/', text: 'Investigation Workspace', style: 'font-weight:600;text-decoration:none' }),
    caseTitle,
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted', text: state.user ? (state.user.fullName || state.user.email || '') : '' }),
    el('button', { class: 'ghost', text: 'Выйти', onclick: logout }),
  ]);

  const nodes = [header];

  if (route.caseId && (!state.caseInfo || state.caseInfo.id !== route.caseId)) {
    // Тихо: отсутствие названия не должно мешать открыть вкладку.
    try {
      const list = await api('/api/cases');
      state.caseInfo = list.cases.find(function (c) { return c.id === route.caseId; }) || null;
    } catch (error) { state.caseInfo = null; }
    if (state.caseInfo) {
      caseTitle.textContent = state.caseInfo.case_number + ' · ' + state.caseInfo.title;
    }
  }

  if (route.caseId) {
    nodes.push(el('nav', { class: 'tabs' }, TABS.map(function (t) {
      return el('a', {
        href: '#/case/' + route.caseId + '/' + t.id,
        class: t.id === route.tab ? 'active' : '',
        text: t.title,
      });
    })));
  }

  const main = el('main', {});
  nodes.push(main);
  setChildren(app, nodes);

  try {
    if (!route.caseId) { state.caseInfo = null; await viewCaseList(main); return; }
    const view = VIEWS[route.tab] || viewOverview;
    await view(main);
    // Название дела становится известно только после загрузки данных: заголовок
    // дорисовывается, а не остаётся пустым до перехода на другую вкладку.
    if (state.caseInfo) {
      caseTitle.textContent = state.caseInfo.case_number + ' · ' + state.caseInfo.title;
    }
  } catch (error) {
    setChildren(main, [el('div', { class: 'card' }, [
      el('h2', { text: 'Не удалось загрузить' }),
      el('p', { class: 'error', text: error.message }),
    ])]);
  }
}

window.addEventListener('hashchange', render);

state.token = readToken();
if (state.token) {
  api('/api/auth/me')
    .then(function (me) { state.user = me; render(); })
    .catch(function () { logout(); });
} else {
  render();
}
`;

/**
 * @returns {string} самодостаточная страница рабочего места
 */
export function renderWorkspacePage() {
  return '<!doctype html>\n'
    + '<html lang="ru">\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta name="referrer" content="no-referrer">\n'
    + '<meta name="robots" content="noindex, nofollow">\n'
    + '<title>Investigation Workspace</title>\n'
    + '<style>' + STYLE + '</style>\n'
    + '</head>\n<body>\n'
    + '<div id="app"></div>\n'
    + '<script>' + SCRIPT_CORE + SCRIPT_VIEWS + SCRIPT_VIEWS2 + SCRIPT_BOOT + '</script>\n'
    + '</body>\n</html>';
}
