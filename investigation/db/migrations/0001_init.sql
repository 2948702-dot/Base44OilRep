-- Сгенерировано investigation/tools/generate-sql.mjs.
-- Не редактировать вручную: источник — investigation/tools/entity-definitions.mjs.
--
-- Миграция 0001: начальная схема платформы расследований.
--
-- Роль приложения обязана быть создана БЕЗ bypassrls, иначе изоляция арендатора
-- превращается в соглашение вместо гарантии.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- Идентификатор организации текущего соединения. Приложение выставляет его на каждом
-- запросе; политики RLS ниже опираются только на него.
-- set_config('app.organization_id', '<uuid>', true);

-- ============================ ТАБЛИЦЫ ============================

-- Организация (tenant)
create table organization (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  country text,
  default_currency text,
  data_retention_days numeric,
  status text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_status_check check (status is null or status in ('active', 'suspended', 'closed'))
);

-- Пользователь платформы
create table app_user (
  id uuid primary key default gen_random_uuid(),
  role text,
  organization_id uuid,
  full_name text,
  job_title text,
  case_ids text[],
  status text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_role_check check (role is null or role in ('system_admin', 'org_owner', 'investigation_manager', 'investigator', 'reviewer', 'read_only')),
  constraint app_user_status_check check (status is null or status in ('active', 'disabled'))
);

-- Дело
create table investigation_case (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_number text not null,
  title text not null,
  description text,
  case_type text,
  severity text,
  status text not null,
  current_stage text,
  created_by text,
  case_owner_id uuid,
  incident_start_at timestamptz,
  incident_end_at timestamptz,
  incident_time_precision text,
  location text,
  estimated_loss numeric,
  currency text,
  confidentiality_level text,
  autonomy_level text,
  overall_confidence text,
  current_round numeric,
  finalized_at timestamptz,
  is_training boolean,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_case_case_type_check check (case_type is null or case_type in ('theft', 'fraud', 'cash_shortage', 'policy_violation', 'conflict_of_interest', 'data_leak', 'safety_incident', 'harassment', 'quality_failure', 'other')),
  constraint investigation_case_severity_check check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  constraint investigation_case_status_check check (status is null or status in ('draft', 'intake', 'planning', 'evidence_collection', 'interviews', 'analysis', 'follow_up', 'review', 'completed', 'archived')),
  constraint investigation_case_current_stage_check check (current_stage is null or current_stage in ('intake', 'planning', 'evidence_collection', 'interview_round', 'analysis', 'adversarial_review', 'follow_up', 'reporting', 'closed')),
  constraint investigation_case_incident_time_precision_check check (incident_time_precision is null or incident_time_precision in ('exact', 'minute', 'hour', 'part_of_day', 'day', 'week', 'month', 'range', 'unknown')),
  constraint investigation_case_confidentiality_level_check check (confidentiality_level is null or confidentiality_level in ('standard', 'restricted', 'strict')),
  constraint investigation_case_autonomy_level_check check (autonomy_level is null or autonomy_level in ('A0', 'A1', 'A2', 'A3')),
  constraint investigation_case_overall_confidence_check check (overall_confidence is null or overall_confidence in ('very_low', 'low', 'moderate', 'high', 'very_high'))
);

-- Участник дела
create table person (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  name text not null,
  role text,
  job_title text,
  organization text,
  phone text,
  email text,
  telegram text,
  relationship_to_incident text,
  participant_type text not null,
  participant_type_changed_at timestamptz,
  participant_type_approval_id text,
  notes text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_participant_type_check check (participant_type is null or participant_type in ('subject', 'witness', 'reporter', 'manager', 'victim', 'customer', 'external', 'investigator', 'unknown'))
);

-- Первоначальное заявление
create table allegation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  code text not null,
  description text not null,
  source_id uuid,
  reported_by_person_id uuid,
  status text not null,
  amount numeric,
  currency text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allegation_status_check check (status is null or status in ('reported', 'partially_supported', 'supported', 'unsupported', 'inconclusive'))
);

-- Исследовательский вопрос
create table issue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  code text not null,
  question text not null,
  description text,
  related_allegation_ids text[],
  status text not null,
  priority text,
  created_by_agent text,
  agent_run_id text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_status_check check (status is null or status in ('open', 'partially_resolved', 'resolved', 'unresolvable')),
  constraint issue_priority_check check (priority is null or priority in ('low', 'medium', 'high', 'critical'))
);

-- Версия расследования
create table hypothesis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  code text not null,
  description text not null,
  type text not null,
  status text not null,
  created_by_agent text,
  agent_run_id text,
  issue_ids text[],
  support_score numeric,
  contradiction_score numeric,
  confidence text,
  evidence_that_would_support text[],
  evidence_that_would_contradict text[],
  missing_evidence text[],
  alternative_explanations text[],
  red_team_notes text,
  defence_review_notes text,
  last_reviewed_at timestamptz,
  closure_approval_id text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hypothesis_type_check check (type is null or type in ('primary', 'alternative', 'exculpatory', 'procedural', 'accounting_error', 'technical_error', 'unknown')),
  constraint hypothesis_status_check check (status is null or status in ('active', 'weakened', 'supported', 'contradicted', 'eliminated', 'unresolved')),
  constraint hypothesis_confidence_check check (confidence is null or confidence in ('very_low', 'low', 'moderate', 'high', 'very_high'))
);

-- История статусов гипотезы
create table hypothesis_revision (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  hypothesis_id uuid not null,
  revision numeric,
  old_status text,
  new_status text not null,
  reason text,
  changed_by text,
  changed_by_agent text,
  agent_run_id uuid,
  snapshot jsonb,
  changed_at timestamptz,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Источник информации
create table source (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  type text not null,
  title text,
  original_file text,
  sha256 text,
  original_filename text,
  mime_type text,
  byte_size numeric,
  created_at_original timestamptz,
  received_at timestamptz,
  uploaded_by text,
  source_person_id uuid,
  system_origin text,
  integrity_status text,
  is_derived boolean,
  derived_from_source_id uuid,
  derivation_method text,
  untrusted_content boolean,
  extracted_text text,
  notes text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_type_check check (type is null or type in ('interview_audio', 'interview_transcript', 'document', 'email', 'messenger', 'bank_statement', 'accounting_record', 'crm', 'gps', 'cctv', 'photo', 'video', 'witness_statement', 'system_log', 'external_source')),
  constraint source_integrity_status_check check (integrity_status is null or integrity_status in ('verified', 'unverified', 'mismatch', 'unavailable'))
);

-- Доказательство
create table evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  evidence_code text not null,
  source_id uuid not null,
  type text,
  description text,
  relevance text,
  reliability text,
  integrity text,
  collected_at timestamptz,
  collected_by text,
  original_hash text,
  storage_uri text,
  source_locator jsonb,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_type_check check (type is null or type in ('document', 'transaction_record', 'message', 'recording', 'image', 'system_log', 'physical', 'testimony', 'other')),
  constraint evidence_relevance_check check (relevance is null or relevance in ('low', 'medium', 'high', 'critical')),
  constraint evidence_reliability_check check (reliability is null or reliability in ('unknown', 'low', 'moderate', 'high')),
  constraint evidence_integrity_check check (integrity is null or integrity in ('intact', 'questionable', 'compromised', 'unknown'))
);

-- Атомарное утверждение
create table claim (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  claim_code text not null,
  source_id uuid,
  source_person_id uuid,
  interview_id uuid,
  answer_id uuid,
  text text not null,
  normalized_statement text,
  claim_type text,
  subject_entity text,
  predicate text,
  object_entity text,
  time_start timestamptz,
  time_end timestamptz,
  time_precision text,
  amount numeric,
  currency text,
  location text,
  speaker_certainty text,
  ai_extraction_confidence text,
  corroboration_status text,
  verification_status text,
  source_locator jsonb,
  created_by_agent text,
  agent_run_id uuid,
  reviewed_by_human boolean,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_claim_type_check check (claim_type is null or claim_type in ('action', 'observation', 'state', 'intention', 'knowledge', 'denial', 'hearsay', 'opinion', 'document_content', 'other')),
  constraint claim_time_precision_check check (time_precision is null or time_precision in ('exact', 'minute', 'hour', 'part_of_day', 'day', 'week', 'month', 'range', 'unknown')),
  constraint claim_speaker_certainty_check check (speaker_certainty is null or speaker_certainty in ('certain', 'probable', 'approximate', 'uncertain', 'hearsay', 'unknown')),
  constraint claim_ai_extraction_confidence_check check (ai_extraction_confidence is null or ai_extraction_confidence in ('very_low', 'low', 'moderate', 'high', 'very_high')),
  constraint claim_corroboration_status_check check (corroboration_status is null or corroboration_status in ('uncorroborated', 'single_source', 'multi_source', 'independently_corroborated', 'contradicted')),
  constraint claim_verification_status_check check (verification_status is null or verification_status in ('unverified', 'partially_verified', 'verified', 'refuted'))
);

-- Связь утверждения и доказательства
create table claim_evidence_link (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  claim_id uuid not null,
  evidence_id uuid not null,
  relation text not null,
  strength text,
  explanation text,
  created_by_agent text,
  agent_run_id uuid,
  reviewed_by_human boolean,
  reviewed_by text,
  reviewed_at timestamptz,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_evidence_link_relation_check check (relation is null or relation in ('supports', 'contradicts', 'partially_supports', 'contextual', 'neutral')),
  constraint claim_evidence_link_strength_check check (strength is null or strength in ('weak', 'moderate', 'strong'))
);

-- Событие timeline
create table investigation_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  event_code text not null,
  event_type text,
  description text not null,
  start_at timestamptz,
  end_at timestamptz,
  time_precision text,
  location text,
  participant_person_ids text[],
  source_claim_ids text[],
  supporting_evidence_ids text[],
  confidence text,
  competing_versions jsonb,
  created_by_agent text,
  agent_run_id uuid,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_event_event_type_check check (event_type is null or event_type in ('payment', 'handover', 'arrival', 'departure', 'communication', 'document_created', 'system_action', 'observation', 'other')),
  constraint investigation_event_time_precision_check check (time_precision is null or time_precision in ('exact', 'minute', 'hour', 'part_of_day', 'day', 'week', 'month', 'range', 'unknown')),
  constraint investigation_event_confidence_check check (confidence is null or confidence in ('very_low', 'low', 'moderate', 'high', 'very_high'))
);

-- Противоречие
create table contradiction (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  contradiction_code text not null,
  claim_a_id uuid not null,
  claim_b_id uuid not null,
  type text not null,
  severity text,
  description text,
  issue_id uuid,
  resolution_status text,
  recommended_checks text[],
  resolved_by text,
  resolution_note text,
  created_by_agent text,
  agent_run_id uuid,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contradiction_type_check check (type is null or type in ('direct', 'temporal', 'financial', 'location', 'identity', 'sequence', 'documentary', 'partial')),
  constraint contradiction_severity_check check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  constraint contradiction_resolution_status_check check (resolution_status is null or resolution_status in ('open', 'under_investigation', 'resolved', 'unresolvable'))
);

-- Интервью
create table interview (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  person_id uuid not null,
  round numeric not null,
  status text not null,
  channel text not null,
  started_at timestamptz,
  completed_at timestamptz,
  original_audio_source_id text,
  transcript_source_id text,
  summary text,
  interview_plan jsonb,
  dispatch_approval_id uuid,
  language text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_status_check check (status is null or status in ('planned', 'pending_approval', 'invited', 'in_progress', 'completed', 'declined', 'expired', 'cancelled')),
  constraint interview_channel_check check (channel is null or channel in ('web', 'telegram', 'whatsapp', 'phone_assisted', 'manual'))
);

-- Вопрос интервью
create table interview_question (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  interview_id uuid not null,
  question text not null,
  question_type text not null,
  purpose text,
  issue_id uuid,
  hypothesis_ids text[],
  sequence numeric,
  generated_by text,
  generated_by_agent text,
  agent_run_id uuid,
  sensitive boolean,
  approval_id uuid,
  approved_by text,
  approved_at timestamptz,
  asked_at timestamptz,
  status text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_question_question_type_check check (question_type is null or question_type in ('open', 'clarification', 'probing', 'chronology', 'corroboration', 'challenge', 'closing')),
  constraint interview_question_generated_by_check check (generated_by is null or generated_by in ('agent', 'human')),
  constraint interview_question_status_check check (status is null or status in ('draft', 'approved', 'asked', 'answered', 'skipped'))
);

-- Ответ участника
create table interview_answer (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  question_id uuid not null,
  interview_id uuid not null,
  person_id uuid,
  text text,
  original_source_id uuid,
  audio_source_id uuid,
  transcript text,
  transcript_confirmed boolean,
  duration numeric,
  edited_by_person boolean,
  original_version text,
  attachment_source_ids text[],
  extraction_status text,
  received_at timestamptz,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_answer_extraction_status_check check (extraction_status is null or extraction_status in ('pending', 'running', 'completed', 'failed'))
);

-- Токен доступа участника
create table interview_access_token (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  interview_id uuid not null,
  person_id uuid not null,
  token_hash text not null,
  channel text,
  issued_at timestamptz,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  max_uses numeric,
  use_count numeric,
  last_ip text,
  last_user_agent text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_access_token_channel_check check (channel is null or channel in ('web', 'telegram'))
);

-- Денежная операция
create table money_transaction (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  transaction_code text not null,
  payer text,
  receiver text,
  amount numeric,
  currency text,
  expected_at timestamptz,
  actual_at timestamptz,
  payment_method text,
  bank_reference text,
  source_id uuid,
  verification_status text,
  related_booking text,
  related_event_id uuid,
  notes text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_transaction_payment_method_check check (payment_method is null or payment_method in ('cash', 'card', 'bank_transfer', 'acquiring', 'crypto', 'offset', 'unknown')),
  constraint money_transaction_verification_status_check check (verification_status is null or verification_status in ('unverified', 'partially_verified', 'verified', 'contradicted'))
);

-- Ребро движения средств
create table money_flow_edge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  transaction_id uuid,
  sequence numeric,
  source_entity text not null,
  destination_entity text not null,
  amount numeric,
  currency text,
  occurred_at timestamptz,
  time_precision text,
  evidence_ids text[],
  verification_status text not null,
  flow_type text,
  notes text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_flow_edge_time_precision_check check (time_precision is null or time_precision in ('exact', 'minute', 'hour', 'part_of_day', 'day', 'week', 'month', 'range', 'unknown')),
  constraint money_flow_edge_verification_status_check check (verification_status is null or verification_status in ('unverified', 'partially_verified', 'verified', 'contradicted')),
  constraint money_flow_edge_flow_type_check check (flow_type is null or flow_type in ('expected', 'actual'))
);

-- Итоговый вывод
create table finding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  finding_code text not null,
  statement text not null,
  finding_type text not null,
  confidence text,
  supporting_claim_ids text[],
  supporting_evidence_ids text[],
  contradicting_evidence_ids text[],
  alternative_explanations text[],
  issue_ids text[],
  hypothesis_ids text[],
  review_status text,
  defence_review_verdict text,
  defence_review_notes text,
  defence_reviewed_at timestamptz,
  approval_id uuid,
  approved_by text,
  approved_at timestamptz,
  created_by_agent text,
  agent_run_id uuid,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finding_finding_type_check check (finding_type is null or finding_type in ('fact', 'corroborated_claim', 'inference', 'unresolved', 'procedural_failure', 'root_cause')),
  constraint finding_confidence_check check (confidence is null or confidence in ('very_low', 'low', 'moderate', 'high', 'very_high')),
  constraint finding_review_status_check check (review_status is null or review_status in ('draft', 'under_review', 'approved', 'rejected')),
  constraint finding_defence_review_verdict_check check (defence_review_verdict is null or defence_review_verdict in ('conclusions_hold', 'conclusions_require_more_evidence', 'conclusions_should_not_stand'))
);

-- Задача расследования
create table investigation_task (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  title text not null,
  description text,
  task_type text,
  status text not null,
  priority text,
  assignee_id text,
  due_at timestamptz,
  issue_id uuid,
  hypothesis_id uuid,
  contradiction_id uuid,
  person_id uuid,
  evidence_id uuid,
  expected_information_gain text,
  urgency text,
  estimated_cost text,
  reason text,
  created_by_agent text,
  agent_run_id uuid,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_task_task_type_check check (task_type is null or task_type in ('request_document', 'request_cctv', 'request_bank_statement', 'request_system_log', 'interview', 'follow_up_interview', 'site_visit', 'expert_review', 'other')),
  constraint investigation_task_status_check check (status is null or status in ('proposed', 'accepted', 'in_progress', 'completed', 'cancelled', 'blocked')),
  constraint investigation_task_priority_check check (priority is null or priority in ('low', 'medium', 'high', 'critical')),
  constraint investigation_task_expected_information_gain_check check (expected_information_gain is null or expected_information_gain in ('very_low', 'low', 'moderate', 'high', 'very_high')),
  constraint investigation_task_urgency_check check (urgency is null or urgency in ('low', 'medium', 'high'))
);

-- Запрос человеческого утверждения
create table approval_request (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  approval_type text not null,
  object_type text not null,
  object_id text,
  requested_by text,
  requested_at timestamptz,
  status text not null,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  payload jsonb,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_request_approval_type_check check (approval_type is null or approval_type in ('interview_dispatch', 'sensitive_question', 'subject_designation', 'hypothesis_closure', 'finding_approval', 'final_report_release')),
  constraint approval_request_status_check check (status is null or status in ('pending', 'approved', 'rejected', 'withdrawn'))
);

-- Итоговый отчёт расследования
create table investigation_report (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  version numeric not null,
  status text not null,
  title text,
  sections jsonb,
  finding_ids text[],
  cited_finding_codes text[],
  unresolved_questions text[],
  methodology_version text,
  generated_by_agent text,
  agent_run_id uuid,
  final_review_agent_run_id uuid,
  approval_id uuid,
  released_at timestamptz,
  released_by text,
  supersedes_report_id uuid,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_report_status_check check (status is null or status in ('draft', 'under_review', 'approved', 'released', 'superseded'))
);

-- Запуск агента
create table agent_run (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  agent_type text not null,
  agent_version text,
  prompt_version text,
  model text,
  input_object_ids text[],
  input_digest text,
  output jsonb,
  output_schema_version text,
  started_at timestamptz,
  finished_at timestamptz,
  input_tokens numeric,
  output_tokens numeric,
  cost numeric,
  status text not null,
  error text,
  triggered_by text,
  job_id uuid,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_run_status_check check (status is null or status in ('running', 'completed', 'failed', 'rejected_schema', 'cancelled'))
);

-- Фоновая задача
create table investigation_job (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  job_type text not null,
  status text not null,
  payload jsonb,
  result jsonb,
  error text,
  attempts numeric,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  agent_run_id uuid,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_job_job_type_check check (job_type is null or job_type in ('transcription', 'document_parse', 'claim_extraction', 'timeline_rebuild', 'contradiction_scan', 'hypothesis_review', 'report_generation')),
  constraint investigation_job_status_check check (status is null or status in ('queued', 'running', 'completed', 'failed'))
);

-- Журнал аудита
create table audit_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid,
  actor text,
  actor_type text not null,
  timestamp timestamptz,
  object_type text not null,
  object_id text,
  operation text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip text,
  device text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audit_event_actor_type_check check (actor_type is null or actor_type in ('user', 'agent', 'system', 'participant')),
  constraint audit_event_operation_check check (operation is null or operation in ('create', 'update', 'soft_delete', 'restore', 'status_change', 'approve', 'reject', 'export', 'access'))
);

-- Документ knowledge space
create table knowledge_document (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid,
  space text not null,
  title text not null,
  content text,
  chunk_index numeric,
  embedding_ref text,
  source_id uuid,
  metadata jsonb,
  methodology_version text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_document_space_check check (space is null or space in ('methodology', 'case'))
);

-- Учебное дело
create table training_case (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text not null,
  type text not null,
  scenario text,
  ground_truth jsonb,
  initial_information text,
  evidence_sequence jsonb,
  persons jsonb,
  events jsonb,
  claims jsonb,
  correct_hypotheses text[],
  misleading_hypotheses text[],
  expected_investigative_actions text[],
  published boolean,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_case_type_check check (type is null or type in ('real_public', 'synthetic', 'fiction_adapted', 'internal_anonymized'))
);

-- Прогон симулятора
create table simulation_run (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  training_case_id uuid not null,
  case_id uuid,
  training_case_slug text,
  status text not null,
  director_mode text,
  investigator_model text,
  methodology_version text,
  benchmark_version text,
  started_at timestamptz,
  finished_at timestamptz,
  steps jsonb,
  interactions jsonb,
  error text,
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulation_run_status_check check (status is null or status in ('pending', 'running', 'completed', 'failed')),
  constraint simulation_run_director_mode_check check (director_mode is null or director_mode in ('scripted', 'agent'))
);

-- Результат бенчмарка
create table benchmark_result (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  simulation_run_id uuid not null,
  training_case_id uuid,
  training_case_slug text,
  benchmark_version text not null,
  scored_at timestamptz,
  metrics jsonb,
  summary jsonb,
  safety_passed boolean,
  safety_failures text[],
  deleted_at timestamptz,
  deleted_by text,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Организация несёт человекочитаемый идентификатор для поддомена и экспорта.
alter table organization add column slug text;

-- ======================= СВЯЗИ И УНИКАЛЬНОСТЬ =======================

alter table organization add constraint organization_slug_key unique (slug);

alter table app_user add constraint app_user_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table investigation_case add constraint investigation_case_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table investigation_case add constraint investigation_case_case_owner_id_fkey foreign key (case_owner_id) references app_user(id) on delete set null;
alter table investigation_case add constraint investigation_case_organization_id_case_number_key unique (organization_id, case_number);

alter table person add constraint person_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table person add constraint person_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;

alter table allegation add constraint allegation_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table allegation add constraint allegation_source_id_fkey foreign key (source_id) references source(id) on delete set null;
alter table allegation add constraint allegation_reported_by_person_id_fkey foreign key (reported_by_person_id) references person(id) on delete set null;
alter table allegation add constraint allegation_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table allegation add constraint allegation_case_id_code_key unique (case_id, code);

alter table issue add constraint issue_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table issue add constraint issue_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table issue add constraint issue_case_id_code_key unique (case_id, code);

alter table hypothesis add constraint hypothesis_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table hypothesis add constraint hypothesis_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table hypothesis add constraint hypothesis_case_id_code_key unique (case_id, code);

alter table hypothesis_revision add constraint hypothesis_revision_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table hypothesis_revision add constraint hypothesis_revision_hypothesis_id_fkey foreign key (hypothesis_id) references hypothesis(id) on delete set null;
alter table hypothesis_revision add constraint hypothesis_revision_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table hypothesis_revision add constraint hypothesis_revision_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table hypothesis_revision add constraint hypothesis_revision_hypothesis_id_revision_key unique (hypothesis_id, revision);

alter table source add constraint source_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table source add constraint source_source_person_id_fkey foreign key (source_person_id) references person(id) on delete set null;
alter table source add constraint source_derived_from_source_id_fkey foreign key (derived_from_source_id) references source(id) on delete set null;
alter table source add constraint source_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table evidence add constraint evidence_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table evidence add constraint evidence_source_id_fkey foreign key (source_id) references source(id) on delete set null;
alter table evidence add constraint evidence_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table evidence add constraint evidence_case_id_evidence_code_key unique (case_id, evidence_code);

alter table claim add constraint claim_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table claim add constraint claim_source_id_fkey foreign key (source_id) references source(id) on delete set null;
alter table claim add constraint claim_source_person_id_fkey foreign key (source_person_id) references person(id) on delete set null;
alter table claim add constraint claim_interview_id_fkey foreign key (interview_id) references interview(id) on delete set null;
alter table claim add constraint claim_answer_id_fkey foreign key (answer_id) references interview_answer(id) on delete set null;
alter table claim add constraint claim_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table claim add constraint claim_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table claim add constraint claim_case_id_claim_code_key unique (case_id, claim_code);

alter table claim_evidence_link add constraint claim_evidence_link_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table claim_evidence_link add constraint claim_evidence_link_claim_id_fkey foreign key (claim_id) references claim(id) on delete set null;
alter table claim_evidence_link add constraint claim_evidence_link_evidence_id_fkey foreign key (evidence_id) references evidence(id) on delete set null;
alter table claim_evidence_link add constraint claim_evidence_link_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table claim_evidence_link add constraint claim_evidence_link_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table investigation_event add constraint investigation_event_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table investigation_event add constraint investigation_event_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table investigation_event add constraint investigation_event_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table investigation_event add constraint investigation_event_case_id_event_code_key unique (case_id, event_code);

alter table contradiction add constraint contradiction_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table contradiction add constraint contradiction_claim_a_id_fkey foreign key (claim_a_id) references claim(id) on delete set null;
alter table contradiction add constraint contradiction_claim_b_id_fkey foreign key (claim_b_id) references claim(id) on delete set null;
alter table contradiction add constraint contradiction_issue_id_fkey foreign key (issue_id) references issue(id) on delete set null;
alter table contradiction add constraint contradiction_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table contradiction add constraint contradiction_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table contradiction add constraint contradiction_case_id_contradiction_code_key unique (case_id, contradiction_code);

alter table interview add constraint interview_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table interview add constraint interview_person_id_fkey foreign key (person_id) references person(id) on delete set null;
alter table interview add constraint interview_dispatch_approval_id_fkey foreign key (dispatch_approval_id) references approval_request(id) on delete set null;
alter table interview add constraint interview_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table interview_question add constraint interview_question_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table interview_question add constraint interview_question_interview_id_fkey foreign key (interview_id) references interview(id) on delete set null;
alter table interview_question add constraint interview_question_issue_id_fkey foreign key (issue_id) references issue(id) on delete set null;
alter table interview_question add constraint interview_question_approval_id_fkey foreign key (approval_id) references approval_request(id) on delete set null;
alter table interview_question add constraint interview_question_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table interview_question add constraint interview_question_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table interview_question add constraint interview_question_interview_id_sequence_key unique (interview_id, sequence);

alter table interview_answer add constraint interview_answer_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table interview_answer add constraint interview_answer_question_id_fkey foreign key (question_id) references interview_question(id) on delete set null;
alter table interview_answer add constraint interview_answer_interview_id_fkey foreign key (interview_id) references interview(id) on delete set null;
alter table interview_answer add constraint interview_answer_person_id_fkey foreign key (person_id) references person(id) on delete set null;
alter table interview_answer add constraint interview_answer_original_source_id_fkey foreign key (original_source_id) references source(id) on delete set null;
alter table interview_answer add constraint interview_answer_audio_source_id_fkey foreign key (audio_source_id) references source(id) on delete set null;
alter table interview_answer add constraint interview_answer_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table interview_access_token add constraint interview_access_token_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table interview_access_token add constraint interview_access_token_interview_id_fkey foreign key (interview_id) references interview(id) on delete set null;
alter table interview_access_token add constraint interview_access_token_person_id_fkey foreign key (person_id) references person(id) on delete set null;
alter table interview_access_token add constraint interview_access_token_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table interview_access_token add constraint interview_access_token_token_hash_key unique (token_hash);

alter table money_transaction add constraint money_transaction_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table money_transaction add constraint money_transaction_source_id_fkey foreign key (source_id) references source(id) on delete set null;
alter table money_transaction add constraint money_transaction_related_event_id_fkey foreign key (related_event_id) references investigation_event(id) on delete set null;
alter table money_transaction add constraint money_transaction_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table money_transaction add constraint money_transaction_case_id_transaction_code_key unique (case_id, transaction_code);

alter table money_flow_edge add constraint money_flow_edge_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table money_flow_edge add constraint money_flow_edge_transaction_id_fkey foreign key (transaction_id) references money_transaction(id) on delete set null;
alter table money_flow_edge add constraint money_flow_edge_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table finding add constraint finding_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table finding add constraint finding_approval_id_fkey foreign key (approval_id) references approval_request(id) on delete set null;
alter table finding add constraint finding_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table finding add constraint finding_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table finding add constraint finding_case_id_finding_code_key unique (case_id, finding_code);

alter table investigation_task add constraint investigation_task_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table investigation_task add constraint investigation_task_issue_id_fkey foreign key (issue_id) references issue(id) on delete set null;
alter table investigation_task add constraint investigation_task_hypothesis_id_fkey foreign key (hypothesis_id) references hypothesis(id) on delete set null;
alter table investigation_task add constraint investigation_task_contradiction_id_fkey foreign key (contradiction_id) references contradiction(id) on delete set null;
alter table investigation_task add constraint investigation_task_person_id_fkey foreign key (person_id) references person(id) on delete set null;
alter table investigation_task add constraint investigation_task_evidence_id_fkey foreign key (evidence_id) references evidence(id) on delete set null;
alter table investigation_task add constraint investigation_task_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table investigation_task add constraint investigation_task_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table approval_request add constraint approval_request_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table approval_request add constraint approval_request_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table investigation_report add constraint investigation_report_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table investigation_report add constraint investigation_report_approval_id_fkey foreign key (approval_id) references approval_request(id) on delete set null;
alter table investigation_report add constraint investigation_report_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table investigation_report add constraint investigation_report_final_review_agent_run_id_fkey foreign key (final_review_agent_run_id) references agent_run(id) on delete set null;
alter table investigation_report add constraint investigation_report_supersedes_report_id_fkey foreign key (supersedes_report_id) references investigation_report(id) on delete set null;
alter table investigation_report add constraint investigation_report_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table investigation_report add constraint investigation_report_case_id_version_key unique (case_id, version);

alter table agent_run add constraint agent_run_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table agent_run add constraint agent_run_job_id_fkey foreign key (job_id) references investigation_job(id) on delete set null;
alter table agent_run add constraint agent_run_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table investigation_job add constraint investigation_job_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table investigation_job add constraint investigation_job_agent_run_id_fkey foreign key (agent_run_id) references agent_run(id) on delete set null;
alter table investigation_job add constraint investigation_job_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table audit_event add constraint audit_event_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table audit_event add constraint audit_event_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table knowledge_document add constraint knowledge_document_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;
alter table knowledge_document add constraint knowledge_document_source_id_fkey foreign key (source_id) references source(id) on delete set null;
alter table knowledge_document add constraint knowledge_document_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table training_case add constraint training_case_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;

alter table simulation_run add constraint simulation_run_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table simulation_run add constraint simulation_run_training_case_id_fkey foreign key (training_case_id) references training_case(id) on delete set null;
alter table simulation_run add constraint simulation_run_case_id_fkey foreign key (case_id) references investigation_case(id) on delete cascade;

alter table benchmark_result add constraint benchmark_result_organization_id_fkey foreign key (organization_id) references organization(id) on delete cascade;
alter table benchmark_result add constraint benchmark_result_simulation_run_id_fkey foreign key (simulation_run_id) references simulation_run(id) on delete set null;
alter table benchmark_result add constraint benchmark_result_training_case_id_fkey foreign key (training_case_id) references training_case(id) on delete set null;

-- ============================ ИНДЕКСЫ ============================

create index investigation_case_org_idx on investigation_case (organization_id) where deleted_at is null;
create index person_org_case_idx on person (organization_id, case_id) where deleted_at is null;
create index allegation_org_case_idx on allegation (organization_id, case_id) where deleted_at is null;
create index issue_org_case_idx on issue (organization_id, case_id) where deleted_at is null;
create index hypothesis_org_case_idx on hypothesis (organization_id, case_id) where deleted_at is null;
create index hypothesis_revision_org_case_idx on hypothesis_revision (organization_id, case_id) where deleted_at is null;
create index source_org_case_idx on source (organization_id, case_id) where deleted_at is null;
create index evidence_org_case_idx on evidence (organization_id, case_id) where deleted_at is null;
create index claim_org_case_idx on claim (organization_id, case_id) where deleted_at is null;
create index claim_evidence_link_org_case_idx on claim_evidence_link (organization_id, case_id) where deleted_at is null;
create index investigation_event_org_case_idx on investigation_event (organization_id, case_id) where deleted_at is null;
create index contradiction_org_case_idx on contradiction (organization_id, case_id) where deleted_at is null;
create index interview_org_case_idx on interview (organization_id, case_id) where deleted_at is null;
create index interview_question_org_case_idx on interview_question (organization_id, case_id) where deleted_at is null;
create index interview_answer_org_case_idx on interview_answer (organization_id, case_id) where deleted_at is null;
create index interview_access_token_org_case_idx on interview_access_token (organization_id, case_id) where deleted_at is null;
create index money_transaction_org_case_idx on money_transaction (organization_id, case_id) where deleted_at is null;
create index money_flow_edge_org_case_idx on money_flow_edge (organization_id, case_id) where deleted_at is null;
create index finding_org_case_idx on finding (organization_id, case_id) where deleted_at is null;
create index investigation_task_org_case_idx on investigation_task (organization_id, case_id) where deleted_at is null;
create index approval_request_org_case_idx on approval_request (organization_id, case_id) where deleted_at is null;
create index investigation_report_org_case_idx on investigation_report (organization_id, case_id) where deleted_at is null;
create index agent_run_org_case_idx on agent_run (organization_id, case_id) where deleted_at is null;
create index investigation_job_org_case_idx on investigation_job (organization_id, case_id) where deleted_at is null;
create index audit_event_org_case_idx on audit_event (organization_id, case_id) where deleted_at is null;
create index knowledge_document_org_case_idx on knowledge_document (organization_id, case_id) where deleted_at is null;
create index training_case_org_idx on training_case (organization_id) where deleted_at is null;
create index simulation_run_org_idx on simulation_run (organization_id) where deleted_at is null;
create index benchmark_result_org_idx on benchmark_result (organization_id) where deleted_at is null;

-- Векторный поиск по двум непересекающимся пространствам знаний.
alter table knowledge_document add column embedding vector(1536);
create index knowledge_document_space_idx on knowledge_document (organization_id, space, case_id);
create index knowledge_document_embedding_idx on knowledge_document
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Поиск по тексту утверждений и материалов.
create index claim_text_idx on claim using gin (to_tsvector('russian', coalesce(normalized_statement, text, '')));
create index source_text_idx on source using gin (to_tsvector('russian', coalesce(extracted_text, '')));

-- =============== ОБНОВЛЕНИЕ updated_at ===============

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organization_set_updated_at before update on organization
  for each row execute function set_updated_at();
create trigger app_user_set_updated_at before update on app_user
  for each row execute function set_updated_at();
create trigger investigation_case_set_updated_at before update on investigation_case
  for each row execute function set_updated_at();
create trigger person_set_updated_at before update on person
  for each row execute function set_updated_at();
create trigger allegation_set_updated_at before update on allegation
  for each row execute function set_updated_at();
create trigger issue_set_updated_at before update on issue
  for each row execute function set_updated_at();
create trigger hypothesis_set_updated_at before update on hypothesis
  for each row execute function set_updated_at();
create trigger hypothesis_revision_set_updated_at before update on hypothesis_revision
  for each row execute function set_updated_at();
create trigger source_set_updated_at before update on source
  for each row execute function set_updated_at();
create trigger evidence_set_updated_at before update on evidence
  for each row execute function set_updated_at();
create trigger claim_set_updated_at before update on claim
  for each row execute function set_updated_at();
create trigger claim_evidence_link_set_updated_at before update on claim_evidence_link
  for each row execute function set_updated_at();
create trigger investigation_event_set_updated_at before update on investigation_event
  for each row execute function set_updated_at();
create trigger contradiction_set_updated_at before update on contradiction
  for each row execute function set_updated_at();
create trigger interview_set_updated_at before update on interview
  for each row execute function set_updated_at();
create trigger interview_question_set_updated_at before update on interview_question
  for each row execute function set_updated_at();
create trigger interview_answer_set_updated_at before update on interview_answer
  for each row execute function set_updated_at();
create trigger interview_access_token_set_updated_at before update on interview_access_token
  for each row execute function set_updated_at();
create trigger money_transaction_set_updated_at before update on money_transaction
  for each row execute function set_updated_at();
create trigger money_flow_edge_set_updated_at before update on money_flow_edge
  for each row execute function set_updated_at();
create trigger finding_set_updated_at before update on finding
  for each row execute function set_updated_at();
create trigger investigation_task_set_updated_at before update on investigation_task
  for each row execute function set_updated_at();
create trigger approval_request_set_updated_at before update on approval_request
  for each row execute function set_updated_at();
create trigger investigation_report_set_updated_at before update on investigation_report
  for each row execute function set_updated_at();
create trigger agent_run_set_updated_at before update on agent_run
  for each row execute function set_updated_at();
create trigger investigation_job_set_updated_at before update on investigation_job
  for each row execute function set_updated_at();
create trigger audit_event_set_updated_at before update on audit_event
  for each row execute function set_updated_at();
create trigger knowledge_document_set_updated_at before update on knowledge_document
  for each row execute function set_updated_at();
create trigger training_case_set_updated_at before update on training_case
  for each row execute function set_updated_at();
create trigger simulation_run_set_updated_at before update on simulation_run
  for each row execute function set_updated_at();
create trigger benchmark_result_set_updated_at before update on benchmark_result
  for each row execute function set_updated_at();

-- =============== НЕИЗМЕНЯЕМЫЕ ЖУРНАЛЫ ===============
--
-- Журнал аудита, запуски агентов и история статусов гипотез пишутся один раз.
-- Это гарантия базы, а не правило приложения: без неё обещание воспроизводимости
-- расследования ничем не обеспечено.

create or replace function forbid_mutation() returns trigger as $$
begin
  -- Единственное исключение — удаление данных арендатора (§60 ТЗ). Право быть забытым
  -- и неизменяемость журнала противоречат друг другу, и разрешать это противоречие
  -- надо явно.
  --
  -- Одного флага мало: выставить настройку сеанса может любая роль, включая роль
  -- приложения. Поэтому требуется ещё и то, чего у приложения нет и не будет, —
  -- права владельца таблицы. Удаление арендатора выполняется отдельным подключением;
  -- роль приложения не сотрёт журнал, даже если выставит флаг.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.tenant_erasure', true), 'off') = 'on'
     and current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)
  then
    return old;
  end if;

  raise exception 'Таблица % — журнальная: изменение и удаление записей запрещены', tg_table_name
    using errcode = 'restrict_violation';
end;
$$ language plpgsql;

create trigger audit_event_append_only before update or delete on audit_event
  for each row execute function forbid_mutation();
create trigger agent_run_append_only before update or delete on agent_run
  for each row execute function forbid_mutation();
create trigger hypothesis_revision_append_only before update or delete on hypothesis_revision
  for each row execute function forbid_mutation();
create trigger benchmark_result_append_only before update or delete on benchmark_result
  for each row execute function forbid_mutation();

-- ============================ RLS ============================

alter table organization enable row level security;
alter table organization force row level security;
create policy organization_tenant_isolation on organization
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table app_user enable row level security;
alter table app_user force row level security;
create policy app_user_tenant_isolation on app_user
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table investigation_case enable row level security;
alter table investigation_case force row level security;
create policy investigation_case_tenant_isolation on investigation_case
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table person enable row level security;
alter table person force row level security;
create policy person_tenant_isolation on person
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table allegation enable row level security;
alter table allegation force row level security;
create policy allegation_tenant_isolation on allegation
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table issue enable row level security;
alter table issue force row level security;
create policy issue_tenant_isolation on issue
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table hypothesis enable row level security;
alter table hypothesis force row level security;
create policy hypothesis_tenant_isolation on hypothesis
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table hypothesis_revision enable row level security;
alter table hypothesis_revision force row level security;
create policy hypothesis_revision_tenant_isolation on hypothesis_revision
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table source enable row level security;
alter table source force row level security;
create policy source_tenant_isolation on source
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table evidence enable row level security;
alter table evidence force row level security;
create policy evidence_tenant_isolation on evidence
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table claim enable row level security;
alter table claim force row level security;
create policy claim_tenant_isolation on claim
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table claim_evidence_link enable row level security;
alter table claim_evidence_link force row level security;
create policy claim_evidence_link_tenant_isolation on claim_evidence_link
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table investigation_event enable row level security;
alter table investigation_event force row level security;
create policy investigation_event_tenant_isolation on investigation_event
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table contradiction enable row level security;
alter table contradiction force row level security;
create policy contradiction_tenant_isolation on contradiction
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table interview enable row level security;
alter table interview force row level security;
create policy interview_tenant_isolation on interview
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table interview_question enable row level security;
alter table interview_question force row level security;
create policy interview_question_tenant_isolation on interview_question
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table interview_answer enable row level security;
alter table interview_answer force row level security;
create policy interview_answer_tenant_isolation on interview_answer
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table interview_access_token enable row level security;
alter table interview_access_token force row level security;
create policy interview_access_token_tenant_isolation on interview_access_token
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table money_transaction enable row level security;
alter table money_transaction force row level security;
create policy money_transaction_tenant_isolation on money_transaction
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table money_flow_edge enable row level security;
alter table money_flow_edge force row level security;
create policy money_flow_edge_tenant_isolation on money_flow_edge
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table finding enable row level security;
alter table finding force row level security;
create policy finding_tenant_isolation on finding
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table investigation_task enable row level security;
alter table investigation_task force row level security;
create policy investigation_task_tenant_isolation on investigation_task
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table approval_request enable row level security;
alter table approval_request force row level security;
create policy approval_request_tenant_isolation on approval_request
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table investigation_report enable row level security;
alter table investigation_report force row level security;
create policy investigation_report_tenant_isolation on investigation_report
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table agent_run enable row level security;
alter table agent_run force row level security;
create policy agent_run_tenant_isolation on agent_run
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table investigation_job enable row level security;
alter table investigation_job force row level security;
create policy investigation_job_tenant_isolation on investigation_job
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table audit_event enable row level security;
alter table audit_event force row level security;
create policy audit_event_tenant_isolation on audit_event
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table knowledge_document enable row level security;
alter table knowledge_document force row level security;
create policy knowledge_document_tenant_isolation on knowledge_document
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table training_case enable row level security;
alter table training_case force row level security;
create policy training_case_tenant_isolation on training_case
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table simulation_run enable row level security;
alter table simulation_run force row level security;
create policy simulation_run_tenant_isolation on simulation_run
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

alter table benchmark_result enable row level security;
alter table benchmark_result force row level security;
create policy benchmark_result_tenant_isolation on benchmark_result
  using (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  with check (
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    );

