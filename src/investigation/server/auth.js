/**
 * Аутентификация сотрудников платформы.
 *
 * Пароль хранится как scrypt-хэш со случайной солью; сравнение — постоянное по времени.
 * Токен сессии в базе лежит только хэшем: утечка дампа не должна давать вход в чужие
 * расследования.
 *
 * Отдельный контур участника интервью здесь не задействован — он приходит по подписанной
 * ссылке и никогда не получает сессию платформы (§59, §65 ТЗ).
 */

import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { withTenant } from '../repositories/postgres/pool.js';

const scryptAsync = promisify(scrypt);

const SESSION_TTL_HOURS = 12;
const KEY_LENGTH = 64;

/**
 * Ограничение частоты попыток входа.
 *
 * Счётчик живёт в памяти процесса: этого достаточно против перебора и не требует
 * ещё одного хранилища. При нескольких экземплярах приложения предел становится
 * кратно мягче — тогда ограничение переносится на общий слой; здесь важно, что
 * неограниченного перебора не остаётся вовсе.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginFailures = new Map();

function loginKey(email, ip) {
  return `${String(email ?? '').toLowerCase()}|${ip ?? ''}`;
}

function assertLoginAllowed(email, ip) {
  const record = loginFailures.get(loginKey(email, ip));
  if (!record) return;
  if (Date.now() - record.first > LOGIN_WINDOW_MS) {
    loginFailures.delete(loginKey(email, ip));
    return;
  }
  if (record.count >= LOGIN_MAX_FAILURES) {
    throw Object.assign(
      new Error('Слишком много попыток входа. Повторите через несколько минут.'),
      { statusCode: 429 },
    );
  }
}

function recordLoginFailure(email, ip) {
  const key = loginKey(email, ip);
  const record = loginFailures.get(key);
  if (!record || Date.now() - record.first > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { first: Date.now(), count: 1 });
    return;
  }
  record.count += 1;
}

/**
 * Хэш-пустышка для несуществующего адреса.
 *
 * Без него проверка пароля при неизвестном адресе не выполняется вовсе, ответ приходит
 * заметно быстрее, и форма входа снова становится справочником сотрудников — только
 * по времени ответа, а не по его тексту.
 */
const DUMMY_PASSWORD_HASH = `scrypt$${randomBytes(16).toString('hex')}$${randomBytes(KEY_LENGTH).toString('hex')}`;

/**
 * @param {string} password
 * @returns {Promise<string>} строка вида scrypt$<salt>$<hash>
 */
export async function hashPassword(password) {
  if (!password || password.length < 12) {
    throw new Error('Пароль короче 12 символов не принимается');
  }
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Токен передаётся клиенту один раз; в базе остаётся только его хэш. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Вход по адресу и паролю.
 *
 * @param {import('pg').Pool} pool
 * @param {{email: string, password: string, ip?: string, userAgent?: string}} input
 * @returns {Promise<{token: string, user: Object, expiresAt: string}>}
 */
export async function login(pool, input) {
  assertLoginAllowed(input.email, input.ip);

  // Поиск пользователя идёт до того, как организация известна, поэтому запрос
  // выполняется под системным флагом и ограничен одной строкой по адресу.
  const found = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const result = await client.query(
      `select id, organization_id, role, full_name, email, password_hash, status
       from app_user where lower(email) = lower($1) and deleted_at is null`,
      [input.email],
    );
    return result.rows[0] ?? null;
  });

  // Проверка пароля выполняется всегда, в том числе против пустышки: одинаков должен
  // быть не только текст ответа, но и время до него.
  const passwordMatches = await verifyPassword(
    input.password ?? '',
    found?.password_hash ?? DUMMY_PASSWORD_HASH,
  );
  const ok = Boolean(found) && found.status === 'active' && found.password_hash && passwordMatches;

  if (!ok) {
    recordLoginFailure(input.email, input.ip);
    // Один и тот же ответ на несуществующий адрес и на неверный пароль:
    // иначе форма входа превращается в справочник сотрудников организации.
    throw Object.assign(new Error('Неверный адрес или пароль'), { statusCode: 401 });
  }

  loginFailures.delete(loginKey(input.email, input.ip));

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  await withTenant(pool, { organizationId: found.organization_id }, (client) => client.query(
    `insert into user_session (user_id, organization_id, token_hash, expires_at, last_ip, last_user_agent)
     values ($1, $2, $3, $4, $5, $6)`,
    [found.id, found.organization_id, hashToken(token), expiresAt, input.ip ?? null, input.userAgent ?? null],
  ));

  await withTenant(pool, { organizationId: found.organization_id }, (client) => client.query(
    'update app_user set last_login_at = now() where id = $1',
    [found.id],
  ));

  return {
    token,
    expiresAt,
    user: {
      id: found.id,
      organizationId: found.organization_id,
      role: found.role,
      fullName: found.full_name,
      email: found.email,
    },
  };
}

/**
 * Разбор токена сессии в область видимости запроса.
 *
 * @param {import('pg').Pool} pool
 * @param {string} token
 * @returns {Promise<import('../repositories/contracts.js').RepositoryScope & {role: string, userId: string}|null>}
 */
export async function resolveSession(pool, token) {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const session = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    await client.query('select set_config($1, $2, true)', ['app.session_token_hash', tokenHash]);
    const result = await client.query(
      `select s.user_id, s.organization_id, s.expires_at, s.revoked_at, u.role, u.status, u.full_name
       from user_session s join app_user u on u.id = s.user_id
       where s.token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  });

  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at) < new Date()) return null;
  if (session.status !== 'active') return null;

  return {
    organizationId: session.organization_id,
    actorId: session.user_id,
    actorType: 'user',
    userId: session.user_id,
    role: session.role,
    fullName: session.full_name,
    isSystemAdmin: session.role === 'system_admin',
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} token
 */
export async function logout(pool, token) {
  const tokenHash = hashToken(token);
  await withTenant(pool, { organizationId: null, isSystemAdmin: true }, (client) => client.query(
    'update user_session set revoked_at = now() where token_hash = $1 and revoked_at is null',
    [tokenHash],
  ));
}

/** Роли, которым разрешено изменять материалы расследования. */
const WRITE_ROLES = new Set(['system_admin', 'org_owner', 'investigation_manager', 'investigator']);
const APPROVE_ROLES = new Set(['system_admin', 'org_owner', 'investigation_manager', 'reviewer']);

export function assertCanWrite(scope) {
  if (!WRITE_ROLES.has(scope.role)) {
    throw Object.assign(
      new Error(`Роль ${scope.role} не имеет права изменять материалы расследования`),
      { statusCode: 403 },
    );
  }
}

export function assertCanApprove(scope) {
  if (!APPROVE_ROLES.has(scope.role)) {
    throw Object.assign(
      new Error(`Роль ${scope.role} не имеет права утверждать решения расследования`),
      { statusCode: 403 },
    );
  }
}
