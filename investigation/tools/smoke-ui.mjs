/**
 * Проверка интерфейса в настоящем браузере.
 *
 * Запуск: DATABASE_URL=... node investigation/tools/smoke-ui.mjs
 *
 * Маршруты, отвечающие 200, ничего не говорят о том, что человек увидит. Обе ошибки
 * вёрстки, найденные при разработке рабочего места, — пустой массив, роняющий экран
 * целиком, и условный блок, отрисованный словом «null», — проходили все проверки API
 * и обнаружились только здесь.
 *
 * Проверяется не внешний вид, а поведение: что действие без объяснения не проходит,
 * что результат виден сразу, что в консоли нет ошибок.
 */

import { createServer } from '../../src/investigation/server/index.js';
import { createPool, withTenant } from '../../src/investigation/repositories/index.js';
import { createInvestigationServices } from '../../src/investigation/services/index.js';
import { hashPassword } from '../../src/investigation/server/auth.js';

const CHROMIUM_PATHS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
}

async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('Playwright не установлен: проверка интерфейса пропущена.');
    console.log('Установите его отдельно — npm i -D playwright — и повторите.');
    process.exit(0);
  }

  const { existsSync } = await import('node:fs');
  const executablePath = CHROMIUM_PATHS.find((path) => existsSync(path));
  return chromium.launch(executablePath ? { executablePath } : {});
}

/**
 * Данные для проверки создаются напрямую через репозитории, без запуска агентов:
 * проверяется интерфейс, а не методология, и прогон не должен зависеть от модели.
 */
async function seed(pool) {
  const stamp = Date.now();
  const password = 'Пароль-проверки-интерфейса';
  const passwordHash = await hashPassword(password);
  const email = `ui-${stamp}@example.test`;

  const tenant = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const org = await client.query(
      "insert into organization (name, slug, status) values ($1, $2, 'active') returning id",
      [`Проверка интерфейса ${stamp}`, `ui-${stamp}`],
    );
    const organizationId = org.rows[0].id;
    const user = await client.query(
      `insert into app_user (organization_id, role, full_name, email, password_hash, status)
       values ($1, 'investigation_manager', 'Следователь', $2, $3, 'active') returning id`,
      [organizationId, email, passwordHash],
    );
    return { organizationId, actorId: user.rows[0].id };
  });

  const scope = { ...tenant, actorType: 'user' };
  const base = createInvestigationServices({ scope, pool, driver: 'postgres' });
  const investigationCase = await base.cases.createCase({
    title: 'Проверка интерфейса',
    description: 'Дело создано автоматической проверкой рабочего места',
    caseType: 'cash_shortage',
  });

  const app = createInvestigationServices({
    scope: { ...scope, caseId: investigationCase.id }, pool, driver: 'postgres',
  });
  const r = app.repositories;

  const person = await r.persons.create({
    case_id: investigationCase.id, name: 'Иванов Сергей',
    job_title: 'капитан', participant_type: 'witness',
    relationship_to_incident: 'принял оплату от клиента',
  });
  const source = await app.sources.ingestText('Объяснение участника', {
    type: 'witness_statement', title: 'Объяснение', sourcePersonId: person.id,
  });

  const claimA = await r.claims.create({
    case_id: investigationCase.id, claim_code: 'C-001', source_id: source.id,
    source_person_id: person.id, text: 'Передал деньги администратору',
    normalized_statement: 'Иванов утверждает, что передал деньги администратору',
    claim_type: 'action', speaker_certainty: 'approximate', time_precision: 'hour',
    corroboration_status: 'uncorroborated', verification_status: 'unverified',
    source_locator: { char_start: 0, char_end: 20 },
  });
  const claimB = await r.claims.create({
    case_id: investigationCase.id, claim_code: 'C-002', source_id: source.id,
    source_person_id: person.id, text: 'Денег не получала',
    normalized_statement: 'Петрова отрицает получение денег',
    claim_type: 'denial', speaker_certainty: 'certain', time_precision: 'day',
    corroboration_status: 'contradicted', verification_status: 'unverified',
    source_locator: { char_start: 21, char_end: 38 },
  });

  await r.contradictions.create({
    case_id: investigationCase.id, contradiction_code: 'CONTR-001',
    claim_a_id: claimA.id, claim_b_id: claimB.id, type: 'direct', severity: 'critical',
    description: 'Передача денег утверждается одной стороной и отрицается другой',
    resolution_status: 'open',
    recommended_checks: ['Запись камеры', 'Кассовая книга'],
  });

  await r.hypotheses.create({
    case_id: investigationCase.id, code: 'H-001', description: 'Деньги не были оприходованы',
    type: 'primary', status: 'active', confidence: 'low',
    evidence_that_would_support: ['Кассовая книга без записи'],
    evidence_that_would_contradict: ['Запись о приходе в кассовой книге'],
    missing_evidence: ['Кассовая книга'],
  });

  await r.findings.create({
    case_id: investigationCase.id, finding_code: 'F-001',
    statement: 'Передача наличных объективными материалами не подтверждена',
    finding_type: 'unresolved', confidence: 'very_low', review_status: 'draft',
    alternative_explanations: ['Передача состоялась, но не была оприходована'],
  });

  return { caseId: investigationCase.id, email, password };
}

const pool = createPool();
let app = null;
let browser = null;

try {
  const fixture = await seed(pool);

  app = createServer({ pool, logger: false, jobs: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = app.server.address().port;
  const base = `http://127.0.0.1:${port}`;

  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.fill('input[type=text]', fixture.email);
  await page.fill('input[type=password]', fixture.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('table', { timeout: 10000 });
  check('Вход в рабочее место работает', true);

  // Каждый экран открывается и не падает.
  for (const tab of ['overview', 'timeline', 'matrix', 'contradictions', 'hypotheses', 'money', 'report']) {
    await page.goto(`${base}/#/case/${fixture.caseId}/${tab}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    const failed = await page.locator('text=Не удалось загрузить').count();
    check(`Экран «${tab}» открывается`, failed === 0);
  }

  // Ни один экран не должен показывать служебные значения вместо содержимого.
  await page.goto(`${base}/#/case/${fixture.caseId}/hypotheses`, { waitUntil: 'networkidle' });
  const body = await page.locator('body').innerText();
  check('На экране нет служебных значений вместо содержимого',
    !/\bnull\b|\bundefined\b|\[object Object\]/.test(body),
    (body.match(/\bnull\b|\bundefined\b|\[object Object\]/) || []).join(', '));

  // Действие без объяснения не проходит.
  await page.goto(`${base}/#/case/${fixture.caseId}/contradictions`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Разрешено")');
  await page.locator('button:has-text("Разрешено")').first().click();
  await page.waitForTimeout(300);
  check('Закрыть противоречие без объяснения нельзя',
    await page.locator('text=Нужно объяснение.').count() > 0);

  await page.locator('input[placeholder="чем именно разрешено"]').first()
    .fill('Получена запись камеры за спорный промежуток');
  await page.locator('button:has-text("Разрешено")').first().click();
  await page.waitForTimeout(1200);
  check('Противоречие закрывается и решение видно сразу',
    await page.locator('text=Получена запись камеры').count() > 0);

  // Утверждение вывода тоже требует объяснения.
  await page.goto(`${base}/#/case/${fixture.caseId}/report`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Утвердить")');
  await page.locator('button:has-text("Утвердить")').first().click();
  await page.waitForTimeout(300);
  check('Утвердить вывод без объяснения нельзя',
    await page.locator('text=Нужно объяснение.').count() > 0);

  await page.locator('input[placeholder="что проверено"]').first().fill('Сверено с материалами дела');
  await page.locator('button:has-text("Утвердить")').first().click();
  await page.waitForTimeout(1200);
  check('Утверждённый вывод больше не предлагает утверждение',
    await page.locator('button:has-text("Утвердить")').count() === 0);

  check('В консоли браузера нет ошибок', consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(' | '));

  await context.close();
} finally {
  if (browser) await browser.close();
  if (app) await app.close();
  await pool.end();
}

const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} проверок интерфейса пройдено`);
if (failed.length > 0) process.exitCode = 1;
