/**
 * HTTP-слой платформы расследований.
 *
 * Здесь нет бизнес-логики: маршрут разбирает запрос, определяет область видимости и
 * вызывает прикладной сервис. Это условие §78 ТЗ — методология не должна зависеть от
 * транспорта, иначе её нельзя ни переиспользовать, ни проверить без сервера.
 */

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { createPool } from '../repositories/index.js';
import { resolveSession } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCaseRoutes } from './routes/cases.js';
import { registerParticipantRoutes } from './routes/participant.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerViewRoutes } from './routes/views.js';
import { createJobRunner } from './jobRunner.js';
import { renderWorkspacePage } from './workspacePage.js';

/** Маршруты, доступные без сессии платформы. */
const PUBLIC_PREFIXES = ['/api/auth/login', '/api/participant', '/interview/', '/healthz'];

/** Страница рабочего места отдаётся без сессии; данные — только по токену. */
const PUBLIC_EXACT = ['/'];

/**
 * @param {{pool?: Object, logger?: boolean, jobs?: boolean, llm?: Object}} [options]
 */
export function createServer(options = {}) {
  const pool = options.pool ?? createPool();
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 32 * 1024 * 1024,
    // Доверенными считаются только адреса самого сервера и внутренней сети — там,
    // где стоит наш Caddy. При trustProxy: true клиент, приславший свой
    // X-Forwarded-For, назначал бы себе адрес сам: ограничитель частоты обходится
    // сменой заголовка, а last_ip в материалах дела становится выдумкой того, кого
    // проверяют. Caddy свой X-Forwarded-For дописывает справа, поэтому разбор,
    // идущий справа налево до первого недоверенного адреса, берёт настоящий адрес
    // клиента и не может взять подставленный им слева.
    trustProxy: process.env.TRUSTED_PROXIES ?? 'loopback, uniquelocal',
  });

  app.decorate('pool', pool);

  // Голосовые ответы приходят файлом. Предел намеренно щедрый: длинный рассказ
  // в записи — это нормальный ответ, и обрезать его на середине недопустимо.
  app.register(multipart, {
    limits: { fileSize: 64 * 1024 * 1024, files: 1, fields: 8 },
  });

  // Пустое тело при content-type: application/json — обычное поведение клиентов на
  // операциях без полезной нагрузки (выход из системы). Стандартный разбор отвечает на
  // это ошибкой 400, что выглядит как поломка сервера, поэтому пустое тело считаем {}.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      if (!body || body.trim() === '') return done(null, {});
      try {
        done(null, JSON.parse(body));
      } catch (error) {
        done(Object.assign(error, { statusCode: 400 }), undefined);
      }
    },
  );

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (PUBLIC_EXACT.includes(path)) return;
    if (PUBLIC_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;

    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const scope = await resolveSession(pool, token);

    if (!scope) {
      reply.code(401).send({ error: 'Требуется вход' });
      return;
    }
    request.scope = scope;
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? (error.name === 'InvariantViolation' ? 422 : 500);
    if (statusCode >= 500) request.log.error(error);
    reply.code(statusCode).send({
      error: error.message,
      // Нарушение методологического инварианта — это не внутренняя ошибка,
      // а осмысленный отказ, который следователь должен увидеть дословно.
      invariant: error.invariantId ?? undefined,
    });
  });

  /**
   * Рабочее место следователя. Страница отдаётся без проверки сессии: она сама
   * показывает форму входа, а данные без токена не отдаёт ни один маршрут API.
   */
  app.get('/', async (request, reply) => reply
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .header('x-frame-options', 'DENY')
    .header(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
      + "connect-src 'self'; base-uri 'none'; form-action 'none'",
    )
    .send(renderWorkspacePage()));

  app.get('/healthz', async () => {
    const result = await pool.query('select 1 as ok');
    return { status: 'ok', database: result.rows[0].ok === 1 };
  });

  registerAuthRoutes(app);
  registerCaseRoutes(app);
  registerAnalysisRoutes(app);
  registerReportRoutes(app);
  registerViewRoutes(app);
  registerParticipantRoutes(app);

  // Исполнитель очереди живёт в том же процессе: отдельный воркер добавит эксплуатацию
  // раньше, чем появится нагрузка, которая его оправдывает. Захват задач идёт через
  // for update skip locked, поэтому переход на отдельный процесс не потребует изменений.
  if (options.jobs !== false) {
    const runner = createJobRunner({ pool, llm: options.llm, logger: app.log });
    app.decorate('jobs', runner);
    app.addHook('onReady', async () => runner.start());
    app.addHook('onClose', async () => runner.stop());
  }

  return app;
}

/** Точка входа контейнера. */
export async function start() {
  const app = createServer();
  const port = Number(process.env.PORT ?? 8080);
  await app.listen({ port, host: '0.0.0.0' });
  return app;
}

if (process.argv[1]?.endsWith('server/index.js')) {
  start().catch((error) => {
    console.error('Сервер не запустился:', error);
    process.exit(1);
  });
}
