/**
 * Маршруты дела.
 *
 * Каждый маршрут — тонкая обёртка над прикладным сервисом: разбор запроса, область
 * видимости, вызов, ответ. Никакой методологии здесь нет и быть не должно.
 */

import { createInvestigationServices } from '../../services/index.js';
import { assertCanWrite, assertCanApprove } from '../auth.js';

function servicesFor(app, request, caseId) {
  return createInvestigationServices({
    scope: { ...request.scope, caseId },
    pool: app.pool,
    driver: 'postgres',
  });
}

export function registerCaseRoutes(app) {
  app.get('/api/cases', async (request) => {
    const services = servicesFor(app, request);
    return { cases: await services.repositories.cases.list({}, { sort: '-created_at' }) };
  });

  app.post('/api/cases', async (request, reply) => {
    assertCanWrite(request.scope);
    const services = servicesFor(app, request);
    const created = await services.cases.createCase(request.body ?? {});
    return reply.code(201).send(created);
  });

  /**
   * Главный экран дела (§43 ТЗ): состояние, открытые вопросы, критические противоречия,
   * активные версии, ближайшие интервью и рекомендованное следующее действие.
   */
  app.get('/api/cases/:caseId/dashboard', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const snapshot = await services.cases.getSnapshot(caseId);
    if (!snapshot.investigationCase) {
      throw Object.assign(new Error('Дело не найдено'), { statusCode: 404 });
    }
    const { actions } = await services.cases.getNextBestActions(caseId);

    return {
      case: snapshot.investigationCase,
      persons: snapshot.persons,
      open_issues: snapshot.issues.filter((i) => i.status === 'open'),
      critical_contradictions: snapshot.contradictions.filter(
        (c) => c.resolution_status === 'open' && ['critical', 'high'].includes(c.severity),
      ),
      active_hypotheses: snapshot.hypotheses.filter((h) => h.status === 'active'),
      upcoming_interviews: snapshot.interviews.filter(
        (i) => !['completed', 'cancelled', 'declined'].includes(i.status),
      ),
      unverified_money_flows: snapshot.moneyFlowEdges.filter((e) => e.verification_status === 'unverified'),
      pending_approvals: snapshot.approvals.filter((a) => a.status === 'pending'),
      recommended_next_actions: actions,
    };
  });

  app.get('/api/cases/:caseId/graph', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return services.repositories.graph.buildCaseGraph(caseId);
  });

  app.post('/api/cases/:caseId/intake', async (request) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return services.cases.runIntake(caseId, request.body ?? {});
  });

  app.post('/api/cases/:caseId/plan', async (request) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return services.cases.runPlanning(caseId);
  });

  app.post('/api/cases/:caseId/hypotheses/:hypothesisId/red-team', async (request) => {
    assertCanWrite(request.scope);
    const { caseId, hypothesisId } = request.params;
    const services = servicesFor(app, request, caseId);
    return services.cases.runRedTeamReview(caseId, hypothesisId);
  });

  app.post('/api/cases/:caseId/stage', async (request) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const { stage, reason } = request.body ?? {};
    const services = servicesFor(app, request, caseId);
    return services.cases.transitionStage(caseId, stage, reason);
  });

  app.post('/api/cases/:caseId/approvals/:approvalId/decide', async (request) => {
    assertCanApprove(request.scope);
    const { caseId, approvalId } = request.params;
    const { decision, note } = request.body ?? {};
    const services = servicesFor(app, request, caseId);
    return services.approvals.decide(approvalId, decision, note);
  });

  /**
   * Приём материала. Оригинал не изменяется: файл кладётся по хэшу содержимого,
   * а обработанные версии создаются отдельными производными источниками.
   */
  app.post('/api/cases/:caseId/sources/text', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const { text, type, title, sourcePersonId } = request.body ?? {};
    if (!text) return reply.code(400).send({ error: 'Требуется текст материала' });

    const services = servicesFor(app, request, caseId);
    const source = await services.sources.ingestText(text, { type, title, sourcePersonId });
    const scan = await services.sources.scanForInjection(source.id);

    return reply.code(201).send({ source, injection_scan: scan });
  });

  /**
   * Приём файла-материала. Оригинал кладётся по хэшу содержимого и не изменяется;
   * разбор ставится в очередь, потому что извлечение текста из большого PDF
   * не должно держать соединение интерфейса.
   */
  app.post('/api/cases/:caseId/sources/file', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;

    if (!request.isMultipart()) {
      return reply.code(400).send({ error: 'Ожидается файл' });
    }

    let buffer = null;
    let filename = null;
    let mimeType = null;
    let type = 'document';
    let title = null;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        filename = part.filename || 'file';
        mimeType = part.mimetype;
      } else if (part.fieldname === 'type') {
        type = String(part.value);
      } else if (part.fieldname === 'title') {
        title = String(part.value);
      }
    }

    if (!buffer || buffer.length === 0) {
      return reply.code(400).send({ error: 'Файл пуст' });
    }

    const services = servicesFor(app, request, caseId);
    const source = await services.sources.ingestFile(buffer, {
      type, title: title ?? filename, filename, mimeType,
    });

    let job = null;
    if (app.jobs) {
      job = await app.jobs.enqueue({
        organizationId: request.scope.organizationId,
        caseId,
        jobType: 'document_parse',
        payload: { source_id: source.id },
      });
    }

    return reply.code(201).send({ source, parse_job_id: job?.id ?? null });
  });

  /** Повторный разбор материала: нужен после изменения правил извлечения. */
  app.post('/api/cases/:caseId/sources/:sourceId/parse', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId, sourceId } = request.params;
    if (!app.jobs) return reply.code(503).send({ error: 'Исполнитель очереди не запущен' });

    // Скан и фотография документа сначала распознаются, и только потом разбираются:
    // разбирать изображение как текст нечего. Выбор делается по самому материалу,
    // а не спрашивается у следователя — он и так знает, что приложил фотографию.
    const services = servicesFor(app, request, caseId);
    const source = await services.repositories.sources.get(sourceId);
    if (!source) return reply.code(404).send({ error: 'Источник не найден' });

    const isImage = String(source.mime_type ?? '').startsWith('image/')
      || /\.(png|jpe?g|tiff?|bmp|webp)$/i.test(source.original_filename ?? '');

    const job = await app.jobs.enqueue({
      organizationId: request.scope.organizationId,
      caseId,
      jobType: isImage ? 'ocr' : 'document_parse',
      payload: { source_id: sourceId },
    });
    return reply.code(202).send({ status: 'queued', job_id: job.id, job_type: job.job_type });
  });

  app.post('/api/cases/:caseId/sources/:sourceId/evidence', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId, sourceId } = request.params;
    const services = servicesFor(app, request, caseId);
    const evidence = await services.sources.promoteToEvidence(sourceId, request.body ?? {});
    return reply.code(201).send(evidence);
  });

  app.get('/api/cases/:caseId/audit', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return { events: await services.repositories.audit.list({ case_id: caseId }) };
  });
}
