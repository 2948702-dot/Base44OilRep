/**
 * Сбор материалов законченного прогона для оценки (§52 ТЗ).
 *
 * Оценщик не обращается к сервисам и не запускает агентов: он получает готовый набор
 * записей дела и сравнивает его со скрытой истиной. Разделение нужно затем, чтобы
 * метрику можно было посчитать повторно на сохранённом деле — и получить тот же
 * результат, что и в момент прогона.
 */

/**
 * @param {Object} repositories
 * @param {string} caseId
 */
export async function collectArtifacts(repositories, caseId) {
  const [
    investigationCase, persons, hypotheses, claims, evidence, sources, events,
    contradictions, interviews, questions, answers, findings, reports, tasks,
    moneyFlowEdges, transactions, agentRuns,
  ] = await Promise.all([
    repositories.cases.get(caseId),
    repositories.persons.list({ case_id: caseId }),
    repositories.hypotheses.list({ case_id: caseId }),
    repositories.claims.list({ case_id: caseId }),
    repositories.evidence.list({ case_id: caseId }),
    repositories.sources.list({ case_id: caseId }),
    repositories.events.list({ case_id: caseId }),
    repositories.contradictions.list({ case_id: caseId }),
    repositories.interviews.list({ case_id: caseId }),
    repositories.questions.list({ case_id: caseId }),
    repositories.answers.list({ case_id: caseId }),
    repositories.findings.list({ case_id: caseId }),
    repositories.reports.list({ case_id: caseId }),
    repositories.tasks.list({ case_id: caseId }),
    repositories.moneyFlowEdges.list({ case_id: caseId }),
    repositories.transactions.list({ case_id: caseId }),
    repositories.agentRuns.list({ case_id: caseId }),
  ]);

  const report = [...reports].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0))[0] ?? null;

  return {
    investigationCase,
    persons,
    hypotheses,
    claims,
    evidence,
    sources,
    events,
    contradictions,
    interviews,
    questions,
    answers,
    findings,
    reports,
    report,
    tasks,
    moneyFlowEdges,
    transactions,
    agentRuns,
  };
}
