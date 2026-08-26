/**
 * Прогон учебного дела (§51 ТЗ).
 *
 * Симулятор не содержит отдельного «агента-следователя». Расследование ведут те же
 * восемнадцать агентов и те же сервисы, что работают на настоящих делах: измерять имеет
 * смысл только то, что мы поставляем. Отличие от боевого прогона ровно одно — вместо
 * людей отвечает Case Director, знающий скрытую истину.
 *
 * Утверждения человека в прогоне проставляются автоматически. Это не упрощение, а
 * намеренно худший случай: так измеряется, что пройдёт в отчёт, если следователь
 * подпишет всё, что предложили агенты. Метрика ложного обвинения имеет смысл именно
 * при таком допущении.
 *
 * Шаг, завершившийся ошибкой, не останавливает прогон целиком: расследование,
 * сломавшееся на середине, — это тоже результат измерения, и его надо увидеть в
 * метриках, а не в стеке вызовов.
 */

import { collectArtifacts } from './artifacts.js';
import { scoreRun, BENCHMARK_VERSION } from './benchmark.js';

const DEFAULT_LIMITS = {
  personsInterviewed: 2,
  questionsPerPerson: 1,
  evidenceRequests: 6,
};

/** Типы задач, которые считаются запросом материала. */
const REQUEST_TASK_TYPES = [
  'request_document', 'request_cctv', 'request_bank_statement', 'request_system_log',
  'expert_review', 'site_visit', 'other',
];

/**
 * @param {Object} params
 * @param {Object} params.services сервисы в области видимости организации
 * @param {(caseId: string) => Object} params.makeCaseServices сервисы в области видимости дела
 * @param {Object} params.trainingCase запись TrainingCase со скрытой истиной
 * @param {Object} params.director порт Case Director
 * @param {Object} [params.limits]
 * @param {(step: Object) => void} [params.onStep]
 */
export async function runSimulation({
  services, makeCaseServices, trainingCase, director, limits = {}, onStep,
}) {
  const bounds = { ...DEFAULT_LIMITS, ...limits };
  const steps = [];
  const interactions = [];
  const truth = trainingCase.ground_truth ?? {};

  async function step(name, work) {
    const started = Date.now();
    try {
      const result = await work();
      const entry = { name, ok: true, ms: Date.now() - started };
      steps.push(entry);
      onStep?.(entry);
      return result;
    } catch (error) {
      const entry = { name, ok: false, ms: Date.now() - started, error: error.message };
      steps.push(entry);
      onStep?.(entry);
      return null;
    }
  }

  const scenario = trainingCase.scenario ?? {};
  const investigationCase = await services.cases.createCase({
    title: `[учебное] ${trainingCase.title}`,
    description: trainingCase.initial_information,
    caseType: scenario.case_type ?? 'other',
    severity: scenario.severity ?? 'medium',
    estimatedLoss: scenario.estimated_loss ?? null,
    currency: scenario.currency ?? null,
    location: scenario.location ?? null,
    incidentStartAt: scenario.incident_start_at ?? null,
    incidentEndAt: scenario.incident_end_at ?? null,
    incidentTimePrecision: scenario.incident_time_precision ?? 'unknown',
    isTraining: true,
  });

  if (!investigationCase.is_training) {
    throw new Error('Учебное дело создано без пометки is_training: прогон остановлен');
  }

  const app = makeCaseServices(investigationCase.id);
  const caseId = investigationCase.id;

  // ─── Приём заявления и планирование ───

  const intake = await step('intake', () => app.cases.runIntake(caseId, {
    description: trainingCase.initial_information,
  }));
  await step('planning', () => app.cases.runPlanning(caseId));

  // ─── Интервью ───

  const persons = intake?.persons ?? await app.repositories.persons.list({ case_id: caseId });
  const interviewees = persons.slice(0, bounds.personsInterviewed);

  for (const person of interviewees) {
    await step(`interview:${person.name}`, async () => {
      const planned = await app.interviews.planInterview({ personId: person.id, round: 1 });

      const approval = await app.cases.requestInterviewDispatchApproval(
        caseId, [planned.interview.id],
      );
      await app.approvals.decide(approval.id, 'approved', 'Прогон симулятора: состав раунда принят');
      await app.interviews.issueAccessToken(planned.interview.id, {
        baseUrl: 'https://simulator.local',
      });

      const open = (await app.repositories.questions.list({ interview_id: planned.interview.id }))
        .filter((q) => ['approved', 'asked'].includes(q.status))
        .slice(0, bounds.questionsPerPerson);

      for (const question of open) {
        const answer = await director.answerQuestion({
          person, question: question.question, round: 1,
        });
        interactions.push({
          kind: 'interview_answer',
          person: person.name,
          question: question.question,
          matched: answer.matched,
        });

        const submitted = await app.interviews.submitAnswer({
          questionId: question.id, personId: person.id, text: answer.text,
        });
        await app.interviews.extractClaims(submitted.id);
      }
    });
  }

  // ─── Запросы материалов ───
  //
  // Расследование само решает, что запросить: задачи создали агенты. Директор решает,
  // существует ли такой материал. Мимо цели попавший запрос — это потраченный раунд,
  // и он попадает в метрику точности запросов.

  // Материал, уже приобщённый к делу, повторно не приобщается: следующий раунд
  // планирования нередко просит то же самое другими словами, и без этой памяти дело
  // обрастало бы дубликатами одного документа.
  const ingested = new Set();

  async function requestEvidence() {
    const tasks = (await app.repositories.tasks.list({ case_id: caseId }))
      .filter((t) => REQUEST_TASK_TYPES.includes(t.task_type) && t.status === 'proposed')
      .slice(0, bounds.evidenceRequests);

    for (const task of tasks) {
      const requestText = `${task.title ?? ''} ${task.description ?? ''}`.trim();
      const response = await director.respondToRequest({ text: requestText });
      const duplicate = Boolean(response.itemId) && ingested.has(response.itemId);
      interactions.push({
        kind: 'evidence_request',
        request: requestText,
        itemId: response.itemId,
        granted: response.granted,
        duplicate,
        reason: response.reason,
      });

      if (duplicate) {
        await app.repositories.tasks.update(task.id, {
          status: 'completed',
          reason: 'Материал уже приобщён к делу по более раннему запросу',
        });
        continue;
      }

      if (!response.granted) {
        await app.repositories.tasks.update(task.id, {
          status: 'blocked',
          reason: response.reason,
        });
        continue;
      }

      const source = await app.sources.ingestText(response.artifact.content, {
        type: response.artifact.type,
        title: response.artifact.title,
      });
      await app.sources.promoteToEvidence(source.id, {
        type: 'document',
        description: response.artifact.title,
        relevance: response.artifact.relevance,
        reliability: response.artifact.reliability,
      });
      ingested.add(response.itemId);
      await app.repositories.tasks.update(task.id, { status: 'completed', evidence_id: null });
    }
  }

  await step('evidence_requests', requestEvidence);

  // ─── Аналитический цикл ───

  await step('analysis_cycle', () => app.analysis.runAnalysisCycle(caseId, { caseService: app.cases }));

  // Второй заход за материалами: аналитический цикл и независимая проверка порождают
  // новые запросы, и расследование, которое их не сделало, отличается от того, которое
  // сделало. Без второго захода бенчмарк мерил бы только первый раунд.
  await step('evidence_requests_2', requestEvidence);

  if ((truth.money_flow ?? []).length > 0) {
    await step('financial', () => app.analysis.runFinancialAnalysis(caseId));
  }

  // ─── Классификация выводов и отчёт ───

  const finalReview = await step('final_review', () => app.reports.runFinalReview(caseId));

  if (interviewees[0]) {
    await step('defence_review', () => app.reports.runDefenceReview(caseId, interviewees[0].id));
  }
  const rootCause = await step('root_cause', () => app.reports.runRootCause(caseId));

  await step('approve_findings', async () => {
    const candidates = [...(finalReview?.findings ?? []), ...(rootCause?.findings ?? [])];
    for (const finding of candidates) {
      // Утверждение автоматическое и намеренно неразборчивое: измеряется, что пройдёт
      // в отчёт, если человек подпишет всё предложенное.
      try {
        await app.reports.approveFinding(finding.id, 'Прогон симулятора: утверждение без разбора');
      } catch {
        // Вывод, отклонённый защитной проверкой, утвердить нельзя — так и должно быть.
      }
    }
  });

  await step('report', () => app.reports.generateReport(caseId, {
    unresolvedQuestions: finalReview?.unresolvedQuestions ?? [],
  }));

  // ─── Оценка ───

  const artifacts = await collectArtifacts(app.repositories, caseId);
  const scored = scoreRun({ artifacts, groundTruth: truth, interactions });

  return {
    caseId,
    investigationCase,
    steps,
    interactions,
    artifacts,
    ...scored,
    benchmarkVersion: BENCHMARK_VERSION,
    failedSteps: steps.filter((s) => !s.ok),
  };
}
