/**
 * Машина стадий дела.
 *
 * Стадия — не украшение дашборда: от неё зависит, какие действия допустимы и какие
 * агенты запускаются. Переход вперёд без выполнения условий означает, что расследование
 * закрывается раньше, чем собраны данные, — именно то, что метрика Premature Closure
 * должна ловить (§52 ТЗ).
 */

export const STAGES = [
  'intake',
  'planning',
  'evidence_collection',
  'interview_round',
  'analysis',
  'adversarial_review',
  'follow_up',
  'reporting',
  'closed',
];

/** Допустимые переходы. Возврат назад разрешён: новые данные могут отменить продвижение. */
const TRANSITIONS = {
  intake: ['planning'],
  planning: ['evidence_collection', 'interview_round'],
  evidence_collection: ['interview_round', 'analysis', 'planning'],
  interview_round: ['analysis', 'evidence_collection'],
  analysis: ['adversarial_review', 'evidence_collection', 'interview_round'],
  adversarial_review: ['follow_up', 'reporting', 'analysis'],
  follow_up: ['interview_round', 'evidence_collection', 'analysis'],
  reporting: ['closed', 'analysis', 'follow_up'],
  closed: [],
};

/**
 * Условия, без которых переход не имеет смысла. Проверяются по данным дела, а не по
 * намерению пользователя.
 *
 * @type {Record<string, Array<{id: string, describe: string, check: (snapshot: Object) => boolean}>>}
 */
export const STAGE_GUARDS = {
  planning: [
    {
      id: 'intake_produced_allegations',
      describe: 'Из описания инцидента извлечено хотя бы одно заявление',
      check: (s) => s.allegations.length > 0,
    },
    {
      id: 'intake_produced_persons',
      describe: 'В деле есть хотя бы один участник',
      check: (s) => s.persons.length > 0,
    },
  ],
  evidence_collection: [
    {
      id: 'plan_has_alternative_hypotheses',
      describe: 'План содержит не менее трёх версий, включая альтернативные',
      check: (s) => s.hypotheses.length >= 3,
    },
    {
      id: 'plan_has_issues',
      describe: 'Сформулирован хотя бы один исследовательский вопрос',
      check: (s) => s.issues.length > 0,
    },
  ],
  interview_round: [
    {
      id: 'interview_dispatch_approved',
      describe: 'Отправка набора интервью утверждена человеком',
      check: (s) => s.approvals.some(
        (a) => a.approval_type === 'interview_dispatch' && a.status === 'approved',
      ),
    },
  ],
  analysis: [
    {
      id: 'has_claims',
      describe: 'Есть извлечённые утверждения для анализа',
      check: (s) => s.claims.length > 0,
    },
  ],
  adversarial_review: [
    {
      id: 'has_primary_hypothesis',
      describe: 'Есть основная версия, которую можно проверить на прочность',
      check: (s) => s.hypotheses.some((h) => h.type === 'primary'),
    },
    {
      id: 'alternatives_preserved',
      describe: 'Сохранена хотя бы одна альтернативная версия',
      check: (s) => s.hypotheses.some(
        (h) => h.type !== 'primary' && h.status !== 'eliminated',
      ),
    },
  ],
  reporting: [
    {
      id: 'red_team_completed',
      describe: 'Проведена независимая проверка основной версии',
      check: (s) => s.agentRuns.some(
        (r) => r.agent_type === 'red_team_investigator' && r.status === 'completed',
      ),
    },
    {
      id: 'no_unaddressed_critical_contradictions',
      describe: 'Критические противоречия разрешены или явно признаны неразрешимыми',
      check: (s) => !s.contradictions.some(
        (c) => c.severity === 'critical' && c.resolution_status === 'open',
      ),
    },
  ],
  closed: [
    {
      id: 'final_report_approved',
      describe: 'Выпуск итогового отчёта утверждён человеком',
      check: (s) => s.approvals.some(
        (a) => a.approval_type === 'final_report_release' && a.status === 'approved',
      ),
    },
  ],
};

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isTransitionAllowed(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Проверяет переход и возвращает список невыполненных условий.
 *
 * @param {string} from
 * @param {string} to
 * @param {Object} snapshot срез данных дела
 * @returns {{allowed: boolean, reason?: string, unmet: Array<{id: string, describe: string}>}}
 */
export function evaluateTransition(from, to, snapshot) {
  if (!STAGES.includes(to)) {
    return { allowed: false, reason: `Неизвестная стадия: ${to}`, unmet: [] };
  }
  if (!isTransitionAllowed(from, to)) {
    return { allowed: false, reason: `Переход ${from} → ${to} не предусмотрен`, unmet: [] };
  }

  const unmet = (STAGE_GUARDS[to] ?? [])
    .filter((guard) => !guard.check(snapshot))
    .map(({ id, describe }) => ({ id, describe }));

  return {
    allowed: unmet.length === 0,
    reason: unmet.length === 0 ? undefined : 'Не выполнены условия перехода',
    unmet,
  };
}
