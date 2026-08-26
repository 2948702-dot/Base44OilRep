/**
 * Именованные перечисления домена расследования.
 *
 * Значения берутся из сгенерированного файла, а не дублируются: единственный источник
 * истины — investigation/tools/entity-definitions.mjs, из которого собираются и схема
 * базы, и этот модуль.
 */

import { ENUMS, enumValues, isValidEnumValue } from './enums.generated.js';

export { ENUMS, enumValues, isValidEnumValue };

export const CASE_STATUS = enumValues('InvestigationCase', 'status');
export const CASE_STAGE = enumValues('InvestigationCase', 'current_stage');
export const CASE_TYPE = enumValues('InvestigationCase', 'case_type');
export const SEVERITY = enumValues('InvestigationCase', 'severity');
export const CONFIDENTIALITY_LEVEL = enumValues('InvestigationCase', 'confidentiality_level');
export const AUTONOMY_LEVEL = enumValues('InvestigationCase', 'autonomy_level');

export const PARTICIPANT_TYPE = enumValues('Person', 'participant_type');
export const ALLEGATION_STATUS = enumValues('Allegation', 'status');
export const ISSUE_STATUS = enumValues('Issue', 'status');

export const HYPOTHESIS_TYPE = enumValues('Hypothesis', 'type');
export const HYPOTHESIS_STATUS = enumValues('Hypothesis', 'status');

export const SOURCE_TYPE = enumValues('Source', 'type');
export const INTEGRITY_STATUS = enumValues('Source', 'integrity_status');

export const CLAIM_TYPE = enumValues('Claim', 'claim_type');
export const SPEAKER_CERTAINTY = enumValues('Claim', 'speaker_certainty');
export const CORROBORATION_STATUS = enumValues('Claim', 'corroboration_status');
export const VERIFICATION_STATUS = enumValues('Claim', 'verification_status');
export const TIME_PRECISION = enumValues('Claim', 'time_precision');

export const EVIDENCE_RELATION = enumValues('ClaimEvidenceLink', 'relation');
export const CONTRADICTION_TYPE = enumValues('Contradiction', 'type');

export const INTERVIEW_STATUS = enumValues('Interview', 'status');
export const INTERVIEW_CHANNEL = enumValues('Interview', 'channel');
export const QUESTION_TYPE = enumValues('InterviewQuestion', 'question_type');

export const FINDING_TYPE = enumValues('Finding', 'finding_type');
export const APPROVAL_TYPE = enumValues('ApprovalRequest', 'approval_type');
export const APPROVAL_STATUS = enumValues('ApprovalRequest', 'status');
export const JOB_TYPE = enumValues('InvestigationJob', 'job_type');
export const JOB_STATUS = enumValues('InvestigationJob', 'status');
export const AGENT_RUN_STATUS = enumValues('AgentRun', 'status');
export const AUDIT_OPERATION = enumValues('AuditEvent', 'operation');
export const ACTOR_TYPE = enumValues('AuditEvent', 'actor_type');
export const KNOWLEDGE_SPACE = enumValues('KnowledgeDocument', 'space');
export const TRAINING_CASE_TYPE = enumValues('TrainingCase', 'type');
export const USER_ROLE = enumValues('User', 'role');

/**
 * Каналы интервью, доступные в MVP. WhatsApp перенесён в Phase 2 (§15 ТЗ).
 */
export const MVP_INTERVIEW_CHANNELS = ['web', 'telegram'];

/**
 * Уровни автономии, допустимые в MVP (§42 ТЗ).
 */
export const MVP_AUTONOMY_LEVELS = ['A1', 'A2'];
