/**
 * Создание организации и первого пользователя.
 *
 * Запуск:
 *   DATABASE_URL=... node investigation/tools/bootstrap-org.mjs \
 *     --name "ООО Пример" --slug primer --email owner@example.com --password '<пароль>'
 *
 * Пароль не печатается в вывод и не попадает в журнал: в базе остаётся только scrypt-хэш.
 */

import { createPool, withTenant } from '../../src/investigation/repositories/index.js';
import { hashPassword } from '../../src/investigation/server/auth.js';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const name = arg('name');
const slug = arg('slug');
const email = arg('email');
/**
 * Пароль читается со стандартного ввода, если передан --password-stdin.
 *
 * Аргумент командной строки виден в списке процессов сервера любому, кто на нём есть,
 * и остаётся в истории оболочки. Переменная окружения процесса скрыта лучше, но
 * `docker run -e ПАРОЛЬ=...` снова кладёт её в аргументы уже другого процесса.
 * Стандартный ввод не попадает ни туда, ни туда.
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8').replace(/\r?\n$/, '');
}

const password = process.argv.includes('--password-stdin')
  ? await readStdin()
  : arg('password') ?? process.env.BOOTSTRAP_PASSWORD;
const role = arg('role', 'org_owner');

if (!name || !slug || !email || !password) {
  console.error(
    'Требуются --name, --slug, --email и пароль: --password-stdin (предпочтительно), '
    + '--password или BOOTSTRAP_PASSWORD',
  );
  process.exit(1);
}

const pool = createPool();

try {
  const passwordHash = await hashPassword(password);

  const result = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const org = await client.query(
      `insert into organization (name, slug, status, default_currency)
       values ($1, $2, 'active', 'RUB') returning id, name, slug`,
      [name, slug],
    );
    const organizationId = org.rows[0].id;

    const user = await client.query(
      `insert into app_user (organization_id, role, full_name, email, password_hash,
                             password_updated_at, status)
       values ($1, $2, $3, $4, $5, now(), 'active') returning id, email, role`,
      [organizationId, role, arg('full-name', email), email, passwordHash],
    );

    return { organization: org.rows[0], user: user.rows[0] };
  });

  console.log('Организация создана:', result.organization.name, `(${result.organization.id})`);
  console.log('Пользователь создан:', result.user.email, `роль ${result.user.role}`);
} catch (error) {
  console.error('Не удалось создать организацию:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
