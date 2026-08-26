/**
 * Цикл дообследования (§67 ТЗ).
 *
 * Round 1 → Claim Extractor → Timeline → Contradiction Analysis → Hypothesis Review →
 * Red Team → Follow-Up Planner → утверждение человеком → Round 2.
 *
 * Цикл повторяется, пока следователь не остановит его, вопросы не будут разрешены,
 * доказательства не окажутся недоступны или прирост информации не станет пренебрежимым.
 */

export const FOLLOW_UP_PIPELINE = [
  { step: 'claim_extraction', agent: 'claim_extractor', jobType: 'claim_extraction' },
  { step: 'timeline', agent: 'timeline_analyst', jobType: 'timeline_rebuild' },
  { step: 'contradiction_analysis', agent: 'contradiction_analyst', jobType: 'contradiction_scan' },
  { step: 'corroboration', agent: 'corroboration_agent', jobType: 'contradiction_scan' },
  { step: 'hypothesis_review', agent: 'hypothesis_analyst', jobType: 'hypothesis_review' },
  { step: 'adversarial_review', agent: 'red_team_investigator', jobType: 'hypothesis_review' },
  { step: 'follow_up_planning', agent: 'follow_up_planner', jobType: null },
];

export const STOP_REASONS = {
  investigator_stopped: 'Следователь остановил расследование',
  issues_resolved: 'Все исследовательские вопросы разрешены',
  evidence_unavailable: 'Недостающие доказательства недоступны',
  diminishing_value: 'Очередной раунд не даёт значимого прироста информации',
};

/**
 * Решает, нужен ли следующий раунд.
 *
 * Правило намеренно консервативно: раунд не прекращается только потому, что предыдущий
 * дал мало нового. Он прекращается, когда новых проверяемых вопросов не осталось.
 *
 * @param {Object} snapshot
 * @param {Object} [previousRound]
 * @returns {{continue: boolean, reason: string, unresolved: Object}}
 */
export function evaluateFollowUpNeed(snapshot, previousRound = null) {
  const openIssues = snapshot.issues.filter((i) => i.status === 'open');
  const openContradictions = snapshot.contradictions.filter((c) => c.resolution_status === 'open');
  const unverifiedFlows = snapshot.moneyFlowEdges.filter((e) => e.verification_status === 'unverified');
  const activeHypothesesMissingEvidence = snapshot.hypotheses.filter(
    (h) => h.status === 'active' && (h.missing_evidence ?? []).length > 0,
  );

  const unresolved = {
    open_issues: openIssues.length,
    open_contradictions: openContradictions.length,
    unverified_money_flows: unverifiedFlows.length,
    hypotheses_missing_evidence: activeHypothesesMissingEvidence.length,
  };

  const total = Object.values(unresolved).reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    return { continue: false, reason: STOP_REASONS.issues_resolved, unresolved };
  }

  const answeredThisRound = previousRound?.answersCount ?? null;
  const newClaimsThisRound = previousRound?.newClaimsCount ?? null;
  if (answeredThisRound !== null && answeredThisRound > 0 && newClaimsThisRound === 0) {
    return { continue: false, reason: STOP_REASONS.diminishing_value, unresolved };
  }

  return { continue: true, reason: 'Остались непроверенные вопросы', unresolved };
}
