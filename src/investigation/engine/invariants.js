/**
 * Методологические инварианты.
 *
 * Это те правила, которые нельзя оставлять на добросовестность промпта: модель может
 * их нарушить, а следователь под давлением сроков — не заметить. Проверка выполняется
 * перед записью в хранилище.
 */

import { SPEAKER_CERTAINTY, PARTICIPANT_TYPE } from '../domain/enums.js';
import { isConfidenceLevel } from '../domain/confidence.js';

export class InvariantViolation extends Error {
  /**
   * @param {string} invariantId
   * @param {string} message
   */
  constructor(invariantId, message) {
    super(`${invariantId}: ${message}`);
    this.name = 'InvariantViolation';
    this.invariantId = invariantId;
  }
}

/**
 * Установленный факт обязан иметь ссылку на доказательство (§39, §81 ТЗ).
 * @param {Object} finding
 */
export function assertFindingHasEvidence(finding) {
  if (finding.finding_type !== 'fact') return;
  const evidence = finding.supporting_evidence_ids ?? [];
  if (evidence.length === 0) {
    throw new InvariantViolation(
      'FACT_REQUIRES_EVIDENCE',
      `Вывод ${finding.finding_code} обозначен как FACT, но не имеет ссылки на доказательство`,
    );
  }
}

/**
 * Уверенность выражается качественной шкалой; проценты и «вероятность лжи» запрещены (§63, §71).
 * @param {Object} record
 * @param {string} field
 */
export function assertQualitativeConfidence(record, field = 'confidence') {
  const value = record?.[field];
  if (value == null) return;
  if (!isConfidenceLevel(value)) {
    throw new InvariantViolation(
      'QUALITATIVE_CONFIDENCE_ONLY',
      `Поле ${field} должно использовать качественную шкалу, получено: ${String(value)}`,
    );
  }
}

/**
 * Утверждение не существует без источника и позиции в нём (§29 ТЗ).
 * @param {Object} claim
 */
export function assertClaimIsAttributed(claim) {
  if (!claim.source_id) {
    throw new InvariantViolation('CLAIM_REQUIRES_SOURCE', `Утверждение ${claim.claim_code} без источника`);
  }
  const locator = claim.source_locator ?? {};
  const hasPosition = Object.values(locator).some((value) => value !== null && value !== undefined);
  if (!hasPosition) {
    throw new InvariantViolation(
      'CLAIM_REQUIRES_LOCATOR',
      `Утверждение ${claim.claim_code} не указывает позицию в источнике`,
    );
  }
  if (!SPEAKER_CERTAINTY.includes(claim.speaker_certainty)) {
    throw new InvariantViolation(
      'CLAIM_REQUIRES_CERTAINTY',
      `Утверждение ${claim.claim_code} без корректного speaker_certainty`,
    );
  }
}

/**
 * Приблизительное время не превращается в точное (§10, §81 ТЗ).
 * @param {Object} before
 * @param {Object} after
 */
export function assertPrecisionNotInflated(before, after) {
  const rank = ['unknown', 'month', 'week', 'day', 'part_of_day', 'hour', 'minute', 'exact'];
  const from = rank.indexOf(before?.time_precision ?? 'unknown');
  const to = rank.indexOf(after?.time_precision ?? 'unknown');
  if (to > from) {
    throw new InvariantViolation(
      'PRECISION_NOT_INFLATED',
      `Точность времени повышена с ${before?.time_precision} до ${after?.time_precision} без нового источника`,
    );
  }
}

/**
 * Перевод человека в статус subject требует утверждения человеком (§42 ТЗ).
 * @param {Object} params
 */
export function assertSubjectDesignationApproved({ nextParticipantType, approval }) {
  if (nextParticipantType !== 'subject') return;
  if (!PARTICIPANT_TYPE.includes(nextParticipantType)) return;
  if (approval?.status !== 'approved' || approval?.approval_type !== 'subject_designation') {
    throw new InvariantViolation(
      'SUBJECT_REQUIRES_APPROVAL',
      'Назначение статуса subject невозможно без утверждённого запроса subject_designation',
    );
  }
}

/**
 * Закрытие гипотезы требует утверждения; альтернативные версии не удаляются (§8, §34, §42 ТЗ).
 * @param {Object} params
 */
export function assertHypothesisClosureAllowed({ nextStatus, approval, remainingAlternatives }) {
  if (nextStatus !== 'eliminated') return;
  if (approval?.status !== 'approved' || approval?.approval_type !== 'hypothesis_closure') {
    throw new InvariantViolation(
      'HYPOTHESIS_CLOSURE_REQUIRES_APPROVAL',
      'Гипотезу нельзя перевести в eliminated без утверждения человеком',
    );
  }
  if (remainingAlternatives === 0) {
    throw new InvariantViolation(
      'ALTERNATIVES_MUST_SURVIVE',
      'Нельзя исключить последнюю альтернативную версию: расследование останется без проверки',
    );
  }
}

/**
 * План расследования обязан содержать не менее трёх различных версий (§81 ТЗ).
 * @param {Array<Object>} hypotheses
 */
export function assertHypothesisDiversity(hypotheses) {
  if (hypotheses.length < 3) {
    throw new InvariantViolation(
      'MIN_THREE_HYPOTHESES',
      `План содержит ${hypotheses.length} версий, требуется не менее трёх`,
    );
  }
  const types = new Set(hypotheses.map((h) => h.type));
  if (types.size < 2) {
    throw new InvariantViolation(
      'HYPOTHESIS_TYPE_DIVERSITY',
      'Все версии одного типа: альтернативное объяснение фактически не рассматривается',
    );
  }
  const withoutFalsifier = hypotheses.filter(
    (h) => (h.evidence_that_would_contradict ?? []).length === 0,
  );
  if (withoutFalsifier.length > 0) {
    throw new InvariantViolation(
      'HYPOTHESIS_REQUIRES_FALSIFIER',
      'Версия без доказательства, способного её опровергнуть, непроверяема',
    );
  }
}
