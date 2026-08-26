/**
 * Next Best Action Engine (§68 ТЗ).
 *
 * После каждого аналитического цикла система обязана ответить, что делать дальше и почему.
 * Приоритет определяется ожидаемым приростом информации, а не простотой действия:
 * запросить запись камеры, которая закрывает спорный эпизод, важнее, чем задать ещё один
 * уточняющий вопрос тому, кто уже всё рассказал.
 *
 * Расчёт детерминирован и не требует вызова модели: он опирается на состояние дела.
 * Агент Case Manager может дополнить список, но не заменяет эти правила.
 */

const GAIN_ORDER = ['very_low', 'low', 'moderate', 'high', 'very_high'];
const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical'];

function rank(action) {
  return GAIN_ORDER.indexOf(action.expected_information_gain) * 10
    + PRIORITY_ORDER.indexOf(action.priority);
}

/**
 * @typedef {Object} CaseSnapshot
 * @property {Object} investigationCase
 * @property {Object[]} persons
 * @property {Object[]} issues
 * @property {Object[]} hypotheses
 * @property {Object[]} claims
 * @property {Object[]} evidence
 * @property {Object[]} contradictions
 * @property {Object[]} interviews
 * @property {Object[]} approvals
 * @property {Object[]} tasks
 * @property {Object[]} agentRuns
 * @property {Object[]} moneyFlowEdges
 */

/**
 * @param {CaseSnapshot} snapshot
 * @returns {Array<Object>}
 */
export function computeNextBestActions(snapshot) {
  const actions = [];

  const openCritical = snapshot.contradictions.filter(
    (c) => c.resolution_status === 'open' && ['critical', 'high'].includes(c.severity),
  );
  for (const contradiction of openCritical) {
    const checks = contradiction.recommended_checks ?? [];
    actions.push({
      action: checks.length > 0
        ? `Выполнить проверку: ${checks[0]}`
        : `Определить, чем можно разрешить ${contradiction.contradiction_code}`,
      target: { type: 'Contradiction', code: contradiction.contradiction_code },
      priority: contradiction.severity === 'critical' ? 'critical' : 'high',
      expected_information_gain: 'very_high',
      urgency: 'high',
      reason: `Противоречие ${contradiction.contradiction_code} остаётся открытым и напрямую влияет на версию`,
      requires_human_approval: false,
    });
  }

  const uncorroborated = snapshot.claims.filter(
    (c) => c.corroboration_status === 'uncorroborated' || c.corroboration_status === 'single_source',
  );
  if (uncorroborated.length > 0) {
    actions.push({
      action: `Найти независимое подтверждение для ${uncorroborated.length} утверждений`,
      target: { type: 'Claim', codes: uncorroborated.slice(0, 5).map((c) => c.claim_code) },
      priority: 'high',
      expected_information_gain: 'high',
      urgency: 'medium',
      reason: 'Утверждения опираются на единственный источник и не выдержат проверки в отчёте',
      requires_human_approval: false,
    });
  }

  const unverifiedFlows = snapshot.moneyFlowEdges.filter((e) => e.verification_status === 'unverified');
  if (unverifiedFlows.length > 0) {
    actions.push({
      action: `Запросить подтверждение ${unverifiedFlows.length} неподтверждённых переводов`,
      target: { type: 'MoneyFlowEdge', count: unverifiedFlows.length },
      priority: 'high',
      expected_information_gain: 'very_high',
      urgency: 'high',
      reason: 'Неподтверждённое звено в движении средств не может использоваться как факт',
      requires_human_approval: false,
    });
  }

  const staleHypotheses = snapshot.hypotheses.filter(
    (h) => h.status === 'active' && (h.missing_evidence ?? []).length > 0,
  );
  for (const hypothesis of staleHypotheses.slice(0, 3)) {
    actions.push({
      action: `Собрать недостающее доказательство по ${hypothesis.code}: ${hypothesis.missing_evidence[0]}`,
      target: { type: 'Hypothesis', code: hypothesis.code },
      priority: 'medium',
      expected_information_gain: 'high',
      urgency: 'medium',
      reason: 'Версия остаётся непроверенной, пока это доказательство не получено или не признано недоступным',
      requires_human_approval: false,
    });
  }

  const pendingApprovals = snapshot.approvals.filter((a) => a.status === 'pending');
  for (const approval of pendingApprovals) {
    actions.push({
      action: `Принять решение по запросу утверждения: ${approval.approval_type}`,
      target: { type: 'ApprovalRequest', id: approval.id },
      priority: 'critical',
      expected_information_gain: 'moderate',
      urgency: 'high',
      reason: 'Расследование остановлено до решения человека',
      requires_human_approval: true,
    });
  }

  const notInterviewed = snapshot.persons.filter(
    (p) => p.participant_type !== 'investigator'
      && !snapshot.interviews.some((i) => i.person_id === p.id && i.status === 'completed'),
  );
  for (const person of notInterviewed.slice(0, 5)) {
    actions.push({
      action: `Провести интервью: ${person.name}`,
      target: { type: 'Person', id: person.id },
      priority: 'medium',
      expected_information_gain: 'moderate',
      urgency: 'medium',
      reason: 'Участник ещё не давал объяснений; его версия событий неизвестна',
      requires_human_approval: true,
    });
  }

  const redTeamDone = snapshot.agentRuns.some(
    (r) => r.agent_type === 'red_team_investigator' && r.status === 'completed',
  );
  if (!redTeamDone && snapshot.hypotheses.some((h) => h.type === 'primary')) {
    actions.push({
      action: 'Провести независимую проверку основной версии (Red Team)',
      target: { type: 'Hypothesis', code: snapshot.hypotheses.find((h) => h.type === 'primary')?.code },
      priority: 'high',
      expected_information_gain: 'high',
      urgency: 'medium',
      reason: 'Основная версия не проходила независимую проверку на прочность',
      requires_human_approval: false,
    });
  }

  return actions.sort((a, b) => rank(b) - rank(a));
}
