/**
 * Контур участника интервью.
 *
 * Участник не регистрируется на платформе и не получает сессию. Доступ даёт подписанная
 * ссылка, ограниченная делом, человеком, интервью и сроком.
 *
 * Здесь важнее всего то, чего участник НЕ видит: чужие показания, версии, противоречия,
 * внутренние заметки и даже состав других участников (§59, §65 ТЗ). Ответ маршрута
 * собирается из явного белого списка полей, а не из объекта интервью целиком — иначе
 * первое же добавленное поле однажды утечёт наружу.
 */

import { createHash } from 'node:crypto';
import { withTenant } from '../../repositories/postgres/pool.js';
import { createInvestigationServices } from '../../services/index.js';
import { renderParticipantPage } from '../participantPage.js';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Ограничение частоты обращений с одного адреса.
 *
 * Подобрать токен перебором невозможно: в нём 256 бит случайности. Ограничение нужно
 * для другого — не дать одному источнику нагружать базу проверками ссылок и не дать
 * назойливому клиенту исчерпать пул соединений. Счётчик в памяти процесса: при одном
 * экземпляре приложения этого достаточно, при нескольких его место займёт общий счётчик.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;
const rateCounters = new Map();

function tooManyRequests(ip) {
  const now = Date.now();
  const entry = rateCounters.get(ip);

  if (!entry || now - entry.startedAt > RATE_WINDOW_MS) {
    rateCounters.set(ip, { startedAt: now, count: 1 });
    // Счётчики давних адресов удаляются здесь же: отдельный таймер ради этого
    // держать незачем, а неограниченная карта — это утечка памяти.
    if (rateCounters.size > 5000) {
      for (const [key, value] of rateCounters) {
        if (now - value.startedAt > RATE_WINDOW_MS) rateCounters.delete(key);
      }
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_MAX_REQUESTS;
}

/**
 * Проверяет ссылку и возвращает контекст интервью.
 * Токен ищется под системным флагом: организация до проверки ещё не известна.
 */
async function resolveAccess(pool, token, { ip, userAgent }) {
  if (ip && tooManyRequests(ip)) {
    throw Object.assign(
      new Error('Слишком много обращений. Подождите минуту и обновите страницу.'),
      { statusCode: 429 },
    );
  }
  if (!token || token.length < 32) {
    throw Object.assign(new Error('Ссылка недействительна'), { statusCode: 404 });
  }

  const row = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const result = await client.query(
      `select t.*, i.status as interview_status, i.round, i.language, p.name as person_name
       from interview_access_token t
       join interview i on i.id = t.interview_id
       join person p on p.id = t.person_id
       where t.token_hash = $1`,
      [hashToken(token)],
    );
    return result.rows[0] ?? null;
  });

  // Один и тот же ответ на несуществующий, отозванный и просроченный токен:
  // различие подсказало бы, что ссылка когда-то существовала.
  const invalid = !row
    || row.revoked_at
    || new Date(row.expires_at) < new Date()
    || (row.max_uses != null && Number(row.use_count ?? 0) >= Number(row.max_uses));

  if (invalid) {
    throw Object.assign(new Error('Ссылка недействительна или истекла'), { statusCode: 404 });
  }

  await withTenant(pool, { organizationId: row.organization_id }, (client) => client.query(
    `update interview_access_token
     set use_count = coalesce(use_count, 0) + 1, used_at = now(), last_ip = $2, last_user_agent = $3
     where id = $1`,
    [row.id, ip ?? null, userAgent ?? null],
  ));

  return row;
}

export function registerParticipantRoutes(app) {
  /**
   * Экран участника. Страница отдаётся всегда: существование интервью проверяет уже
   * запрос данных. Иначе сам факт «страница открылась» подсказывал бы, что человек
   * фигурирует в разбирательстве.
   */
  app.get('/interview/:token', async (request, reply) => reply
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .header('x-frame-options', 'DENY')
    .header(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
      + "connect-src 'self'; base-uri 'none'; form-action 'none'",
    )
    .send(renderParticipantPage()));

  /** Экран участника: инструкция, текущие вопросы, его собственные ответы. */
  app.get('/api/participant/:token', async (request) => {
    const access = await resolveAccess(app.pool, request.params.token, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const services = createInvestigationServices({
      scope: {
        organizationId: access.organization_id,
        caseId: access.case_id,
        actorId: access.person_id,
        actorType: 'participant',
      },
      pool: app.pool,
      driver: 'postgres',
    });

    const questions = await services.repositories.questions.list(
      { interview_id: access.interview_id },
      { sort: 'sequence' },
    );
    const answers = await services.repositories.answers.list({ interview_id: access.interview_id });

    return {
      person_name: access.person_name,
      round: access.round,
      language: access.language,
      status: access.interview_status,
      expires_at: access.expires_at,
      // Белый список полей: участник не должен видеть цель вопроса, связанные версии
      // и внутренние отметки следствия.
      questions: questions
        .filter((q) => ['approved', 'asked', 'answered'].includes(q.status))
        .map((q) => ({
          id: q.id,
          sequence: q.sequence,
          question: q.question,
          answered: answers.some((a) => a.question_id === q.id),
        })),
      answers: answers.map((a) => ({
        question_id: a.question_id,
        text: a.text,
        transcript: a.transcript,
        transcript_confirmed: a.transcript_confirmed,
        received_at: a.received_at,
      })),
    };
  });

  /** Ответ участника. Оригинал сохраняется как источник и больше не меняется. */
  app.post('/api/participant/:token/answers', async (request, reply) => {
    const access = await resolveAccess(app.pool, request.params.token, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const { questionId, text } = request.body ?? {};
    if (!questionId || !text) {
      return reply.code(400).send({ error: 'Требуются вопрос и ответ' });
    }

    const services = createInvestigationServices({
      scope: {
        organizationId: access.organization_id,
        caseId: access.case_id,
        actorId: access.person_id,
        actorType: 'participant',
      },
      pool: app.pool,
      driver: 'postgres',
    });

    const question = await services.repositories.questions.get(questionId);
    if (!question || question.interview_id !== access.interview_id) {
      // Вопрос из чужого интервью не существует с точки зрения участника.
      return reply.code(404).send({ error: 'Вопрос не найден' });
    }

    const answer = await services.interviews.submitAnswer({
      questionId,
      personId: access.person_id,
      text,
    });

    return reply.code(201).send({ status: 'accepted', answer_id: answer.id });
  });
}
