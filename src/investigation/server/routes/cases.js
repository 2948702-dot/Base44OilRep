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
