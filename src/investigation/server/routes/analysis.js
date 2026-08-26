/**
 * Маршруты аналитического цикла и очереди.
 *
 * Тяжёлые шаги по умолчанию ставятся в очередь, а не выполняются в запросе: цикл
 * расследования занимает минуты и не должен держать соединение интерфейса (§57 ТЗ).
 * Синхронный запуск оставлен явным параметром для отладки и небольших дел.
 */

import { createInvestigationServices } from '../../services/index.js';
import { assertCanWrite } from '../auth.js';

function servicesFor(app, request, caseId) {
  return createInvestigationServices({
    scope: { ...request.scope, caseId },
    pool: app.pool,
    driver: 'postgres',
  });
}

export function registerAnalysisRoutes(app) {
  /** Подготовка интервью стратегом: план и вопросы. Ссылка выдаётся отдельно. */
  app.post('/api/cases/:caseId/interviews', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const { personId, round, channel, language } = request.body ?? {};
    if (!personId) return reply.code(400).send({ error: 'Требуется personId' });

    const services = servicesFor(app, request, caseId);
    const planned = await services.interviews.planInterview({ personId, round, channel, language });

    return reply.code(201).send({
      interview: planned.interview,
      questions: planned.questions,
      // Список того, что нельзя раскрывать участнику, возвращается следователю,
      // но никогда не попадает в контур участника.
      information_not_to_reveal_yet: planned.plan.information_not_to_reveal_yet,
      objectives: planned.plan.objectives,
    });
  });

  app.post('/api/interviews/:interviewId/continue', async (request) => {
    assertCanWrite(request.scope);
    const services = createInvestigationServices({
      scope: request.scope, pool: app.pool, driver: 'postgres',
    });
    return services.interviews.continueInterview(request.params.interviewId);
  });

  /**
   * Персональная ссылка участника. Возвращается один раз: в базе остаётся только хэш.
   */
  app.post('/api/interviews/:interviewId/link', async (request, reply) => {
    assertCanWrite(request.scope);
    const interviewId = request.params.interviewId;
    const services = createInvestigationServices({
      scope: request.scope, pool: app.pool, driver: 'postgres',
    });
    const baseUrl = request.body?.baseUrl ?? process.env.PARTICIPANT_BASE_URL;
    if (!baseUrl) return reply.code(400).send({ error: 'Не задан базовый адрес ссылки' });

    const issued = await services.interviews.issueAccessToken(interviewId, {
      baseUrl,
      ttlHours: request.body?.ttlHours,
      channel: request.body?.channel ?? 'web',
    });
    return reply.code(201).send({ url: issued.url, expires_at: issued.record.expires_at });
  });

  /**
   * Аналитический цикл: хронология, противоречия, пересмотр версий, независимая
   * проверка, планирование следующего раунда.
   */
  app.post('/api/cases/:caseId/analysis', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);

    if (request.body?.sync === true) {
      return services.analysis.runAnalysisCycle(caseId, { caseService: services.cases });
    }

    if (!app.jobs) {
      return reply.code(503).send({ error: 'Исполнитель очереди не запущен' });
    }

    const job = await app.jobs.enqueue({
      organizationId: request.scope.organizationId,
      caseId,
      jobType: 'timeline_rebuild',
      payload: { requested_by: request.scope.userId },
    });

    return reply.code(202).send({
      status: 'queued',
      job_id: job.id,
      // Цикл дойдёт до пересмотра версий и остановится на утверждении человеком:
      // следующий раунд не рассылается автоматически.
      stops_at: 'follow_up_approval',
    });
  });

  /**
   * Подтверждение утверждений. Отдельный маршрут нужен, чтобы пересчитать
   * подтверждённость после приобщения нового доказательства, не гоняя весь цикл.
   */
  app.post('/api/cases/:caseId/corroboration', async (request) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const result = await services.analysis.runCorroboration(caseId);
    return {
      claims_assessed: result.claims.length,
      links_created: result.links.length,
      claims: result.claims.map((c) => ({
        code: c.claim_code,
        corroboration_status: c.corroboration_status,
        verification_status: c.verification_status,
      })),
    };
  });

  app.get('/api/cases/:caseId/jobs', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return { jobs: await services.repositories.jobs.list({}, { sort: '-created_at', limit: 50 }) };
  });

  /**
   * Запуск следующего раунда по утверждённому плану.
   * Без approved-запроса interview_dispatch ссылки не выдаются, поэтому раунд
   * создаётся, но остаётся без приглашений до решения человека.
   */
  app.post('/api/cases/:caseId/rounds', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);

    const plan = await services.analysis.runFollowUpPlanning(caseId, {
      nextRound: request.body?.round,
    });

    if (plan.recommendStop) {
      return reply.code(200).send({
        status: 'stop_recommended',
        reason: plan.stopReason,
        // Решение остановить расследование принимает человек; агент только предлагает.
        requires_human_decision: true,
      });
    }

    const approval = await services.analysis.requestFollowUpApproval(caseId, plan);
    const created = await services.interviews.startRound(plan);

    return reply.code(201).send({
      round: plan.round,
      approval_request_id: approval.id,
      interviews: created.map((c) => ({
        interview_id: c.interview.id,
        person: c.person.name,
        questions: c.questions.length,
        sensitive_questions: c.questions.filter((q) => q.sensitive).length,
      })),
      unknown_targets: plan.unknownTargets,
    });
  });
}
