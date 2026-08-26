/**
 * Маршруты выводов и итогового отчёта.
 *
 * Разделение ролей здесь не формальность: составить отчёт может следователь, а утвердить
 * вывод и выпустить отчёт — только тот, кто вправе утверждать. Иначе человек, ведущий
 * расследование, сам подтверждает собственные выводы, и независимой проверки не остаётся.
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

export function registerReportRoutes(app) {
  /** Классификация материалов дела в выводы. Выводы создаются черновиками. */
  app.post('/api/cases/:caseId/final-review', async (request) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const review = await services.reports.runFinalReview(caseId);

    return {
      findings: review.findings,
      unresolved_questions: review.unresolvedQuestions,
      // Готовность отчёта — отдельное суждение: выводы могут быть, а выпускать рано.
      report_readiness: review.readiness,
      readiness_reason: review.readinessReason,
    };
  });

  /**
   * Защитная проверка выводов в отношении человека (§36 ТЗ).
   *
   * Запускается до утверждения выводов: проверка, проведённая после, ничего не меняет.
   */
  app.post('/api/cases/:caseId/persons/:personId/defence-review', async (request) => {
    assertCanWrite(request.scope);
    const { caseId, personId } = request.params;
    const services = servicesFor(app, request, caseId);
    const result = await services.reports.runDefenceReview(caseId, personId);
    return {
      verdict: result.review.verdict,
      verdict_reason: result.review.verdict_reason,
      strongest_counterargument: result.review.strongest_counterargument,
      weaknesses: result.review.weaknesses,
      findings_updated: result.findings.length,
      tasks_created: result.tasks.length,
    };
  });

  /** Анализ корневых причин: почему организация допустила событие (§38 ТЗ). */
  app.post('/api/cases/:caseId/root-cause', async (request) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const result = await services.reports.runRootCause(caseId);
    return {
      immediate_cause: result.analysis.immediate_cause,
      root_causes: result.analysis.root_causes,
      control_failures: result.analysis.control_failures,
      findings_created: result.findings.length,
      actions_created: result.tasks.length,
    };
  });

  app.get('/api/cases/:caseId/findings', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return { findings: await services.repositories.findings.list({ case_id: caseId }) };
  });

  app.post('/api/cases/:caseId/findings/:findingId/approve', async (request, reply) => {
    assertCanApprove(request.scope);
    const { caseId, findingId } = request.params;
    const note = request.body?.note;
    if (!note) return reply.code(400).send({ error: 'Утверждение вывода требует обоснования' });
    const services = servicesFor(app, request, caseId);
    return services.reports.approveFinding(findingId, note);
  });

  app.post('/api/cases/:caseId/findings/:findingId/reject', async (request, reply) => {
    assertCanApprove(request.scope);
    const { caseId, findingId } = request.params;
    const note = request.body?.note;
    if (!note) return reply.code(400).send({ error: 'Отклонение вывода требует обоснования' });
    const services = servicesFor(app, request, caseId);
    return services.reports.rejectFinding(findingId, note);
  });

  app.post('/api/cases/:caseId/report', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const report = await services.reports.generateReport(caseId, {
      unresolvedQuestions: request.body?.unresolvedQuestions ?? [],
    });
    return reply.code(201).send(report);
  });

  app.get('/api/cases/:caseId/reports', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return {
      reports: await services.repositories.reports.list({ case_id: caseId }, { sort: '-version' }),
    };
  });

  app.get('/api/cases/:caseId/reports/:reportId', async (request, reply) => {
    const { caseId, reportId } = request.params;
    const services = servicesFor(app, request, caseId);
    const report = await services.repositories.reports.get(reportId);
    if (!report || report.case_id !== caseId) {
      return reply.code(404).send({ error: 'Отчёт не найден' });
    }
    return report;
  });

  app.post('/api/cases/:caseId/reports/:reportId/request-release', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId, reportId } = request.params;
    const services = servicesFor(app, request, caseId);
    const approval = await services.reports.requestRelease(caseId, reportId);
    return reply.code(201).send({ approval_request_id: approval.id, status: approval.status });
  });

  /**
   * Выпуск отчёта закрывает дело. Требует утверждённого запроса final_report_release:
   * без него отказ приходит с кодом инварианта, а не с общей ошибкой.
   */
  app.post('/api/cases/:caseId/reports/:reportId/release', async (request) => {
    assertCanApprove(request.scope);
    const { caseId, reportId } = request.params;
    const services = servicesFor(app, request, caseId);
    return services.reports.releaseReport(reportId, { caseService: services.cases });
  });
}
