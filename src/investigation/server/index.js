/**
 * HTTP-слой платформы расследований.
 *
 * Здесь нет бизнес-логики: маршрут разбирает запрос, определяет область видимости и
 * вызывает прикладной сервис. Это условие §78 ТЗ — методология не должна зависеть от
 * транспорта, иначе её нельзя ни переиспользовать, ни проверить без сервера.
 */

import Fastify from 'fastify';
import { createPool } from '../repositories/index.js';
import { resolveSession } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCaseRoutes } from './routes/cases.js';
import { registerParticipantRoutes } from './routes/participant.js';

/** Маршруты, доступные без сессии платформы. */
const PUBLIC_PREFIXES = ['/api/auth/login', '/api/participant', '/healthz'];

/**
 * @param {{pool?: Object, logger?: boolean}} [options]
 */
export function createServer(options = {}) {
  const pool = options.pool ?? createPool();
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 32 * 1024 * 1024,
    trustProxy: true,
  });

  app.decorate('pool', pool);

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

  app.get('/healthz', async () => {
    const result = await pool.query('select 1 as ok');
    return { status: 'ok', database: result.rows[0].ok === 1 };
  });

  registerAuthRoutes(app);
  registerCaseRoutes(app);
  registerParticipantRoutes(app);

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
