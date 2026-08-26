/* eslint-disable */
// Сгенерировано investigation/tools/generate-enums.mjs.
// Не редактировать вручную: источник — investigation/tools/entity-definitions.mjs.

/**
 * Перечисления сущностей расследования, идентичные схемам Base44.
 * @type {Record<string, Record<string, string[]>>}
 */
export const ENUMS = {
  "Organization": {
    "status": [
      "active",
      "suspended",
      "closed"
    ]
  },
  "User": {
    "role": [
      "system_admin",
      "org_owner",
      "investigation_manager",
      "investigator",
      "reviewer",
      "read_only"
    ],
    "status": [
      "active",
      "disabled"
    ]
  },
  "InvestigationCase": {
    "case_type": [
      "theft",
      "fraud",
      "cash_shortage",
      "policy_violation",
      "conflict_of_interest",
      "data_leak",
      "safety_incident",
      "harassment",
      "quality_failure",
      "other"
    ],
    "severity": [
      "low",
      "medium",
      "high",
      "critical"
    ],
    "status": [
      "draft",
      "intake",
      "planning",
      "evidence_collection",
      "interviews",
      "analysis",
      "follow_up",
      "review",
      "completed",
      "archived"
    ],
    "current_stage": [
      "intake",
      "planning",
      "evidence_collection",
      "interview_round",
      "analysis",
      "adversarial_review",
      "follow_up",
      "reporting",
      "closed"
    ],
    "incident_time_precision": [
      "exact",
      "minute",
      "hour",
      "part_of_day",
      "day",
      "week",
      "month",
      "range",
      "unknown"
    ],
    "confidentiality_level": [
      "standard",
      "restricted",
      "strict"
    ],
    "autonomy_level": [
      "A0",
      "A1",
      "A2",
      "A3"
    ],
    "overall_confidence": [
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high"
    ]
  },
  "Person": {
    "participant_type": [
      "subject",
      "witness",
      "reporter",
      "manager",
      "victim",
      "customer",
      "external",
      "investigator",
      "unknown"
    ]
  },
  "Allegation": {
    "status": [
      "reported",
      "partially_supported",
      "supported",
      "unsupported",
      "inconclusive"
    ]
  },
  "Issue": {
    "status": [
      "open",
      "partially_resolved",
      "resolved",
      "unresolvable"
    ],
    "priority": [
      "low",
      "medium",
      "high",
      "critical"
    ]
  },
  "Hypothesis": {
    "type": [
      "primary",
      "alternative",
      "exculpatory",
      "procedural",
      "accounting_error",
      "technical_error",
      "unknown"
    ],
    "status": [
      "active",
      "weakened",
      "supported",
      "contradicted",
      "eliminated",
      "unresolved"
    ],
    "confidence": [
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high"
    ]
  },
  "Source": {
    "type": [
      "interview_audio",
      "interview_transcript",
      "document",
      "email",
      "messenger",
      "bank_statement",
      "accounting_record",
      "crm",
      "gps",
      "cctv",
      "photo",
      "video",
      "witness_statement",
      "system_log",
      "external_source"
    ],
    "integrity_status": [
      "verified",
      "unverified",
      "mismatch",
      "unavailable"
    ]
  },
  "Evidence": {
    "type": [
      "document",
      "transaction_record",
      "message",
      "recording",
      "image",
      "system_log",
      "physical",
      "testimony",
      "other"
    ],
    "relevance": [
      "low",
      "medium",
      "high",
      "critical"
    ],
    "reliability": [
      "unknown",
      "low",
      "moderate",
      "high"
    ],
    "integrity": [
      "intact",
      "questionable",
      "compromised",
      "unknown"
    ]
  },
  "Claim": {
    "claim_type": [
      "action",
      "observation",
      "state",
      "intention",
      "knowledge",
      "denial",
      "hearsay",
      "opinion",
      "document_content",
      "other"
    ],
    "time_precision": [
      "exact",
      "minute",
      "hour",
      "part_of_day",
      "day",
      "week",
      "month",
      "range",
      "unknown"
    ],
    "speaker_certainty": [
      "certain",
      "probable",
      "approximate",
      "uncertain",
      "hearsay",
      "unknown"
    ],
    "ai_extraction_confidence": [
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high"
    ],
    "corroboration_status": [
      "uncorroborated",
      "single_source",
      "multi_source",
      "independently_corroborated",
      "contradicted"
    ],
    "verification_status": [
      "unverified",
      "partially_verified",
      "verified",
      "refuted"
    ]
  },
  "ClaimEvidenceLink": {
    "relation": [
      "supports",
      "contradicts",
      "partially_supports",
      "contextual",
      "neutral"
    ],
    "strength": [
      "weak",
      "moderate",
      "strong"
    ]
  },
  "InvestigationEvent": {
    "event_type": [
      "payment",
      "handover",
      "arrival",
      "departure",
      "communication",
      "document_created",
      "system_action",
      "observation",
      "other"
    ],
    "time_precision": [
      "exact",
      "minute",
      "hour",
      "part_of_day",
      "day",
      "week",
      "month",
      "range",
      "unknown"
    ],
    "confidence": [
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high"
    ]
  },
  "Contradiction": {
    "type": [
      "direct",
      "temporal",
      "financial",
      "location",
      "identity",
      "sequence",
      "documentary",
      "partial"
    ],
    "severity": [
      "low",
      "medium",
      "high",
      "critical"
    ],
    "resolution_status": [
      "open",
      "under_investigation",
      "resolved",
      "unresolvable"
    ]
  },
  "Interview": {
    "status": [
      "planned",
      "pending_approval",
      "invited",
      "in_progress",
      "completed",
      "declined",
      "expired",
      "cancelled"
    ],
    "channel": [
      "web",
      "telegram",
      "whatsapp",
      "phone_assisted",
      "manual"
    ]
  },
  "InterviewQuestion": {
    "question_type": [
      "open",
      "clarification",
      "probing",
      "chronology",
      "corroboration",
      "challenge",
      "closing"
    ],
    "generated_by": [
      "agent",
      "human"
    ],
    "status": [
      "draft",
      "approved",
      "asked",
      "answered",
      "skipped"
    ]
  },
  "InterviewAnswer": {
    "extraction_status": [
      "pending",
      "running",
      "completed",
      "failed"
    ]
  },
  "InterviewAccessToken": {
    "channel": [
      "web",
      "telegram"
    ]
  },
  "MoneyTransaction": {
    "payment_method": [
      "cash",
      "card",
      "bank_transfer",
      "acquiring",
      "crypto",
      "offset",
      "unknown"
    ],
    "verification_status": [
      "unverified",
      "partially_verified",
      "verified",
      "contradicted"
    ]
  },
  "MoneyFlowEdge": {
    "time_precision": [
      "exact",
      "minute",
      "hour",
      "part_of_day",
      "day",
      "week",
      "month",
      "range",
      "unknown"
    ],
    "verification_status": [
      "unverified",
      "partially_verified",
      "verified",
      "contradicted"
    ],
    "flow_type": [
      "expected",
      "actual"
    ]
  },
  "Finding": {
    "finding_type": [
      "fact",
      "corroborated_claim",
      "inference",
      "unresolved",
      "procedural_failure",
      "root_cause"
    ],
    "confidence": [
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high"
    ],
    "review_status": [
      "draft",
      "under_review",
      "approved",
      "rejected"
    ]
  },
  "InvestigationTask": {
    "task_type": [
      "request_document",
      "request_cctv",
      "request_bank_statement",
      "request_system_log",
      "interview",
      "follow_up_interview",
      "site_visit",
      "expert_review",
      "other"
    ],
    "status": [
      "proposed",
      "accepted",
      "in_progress",
      "completed",
      "cancelled",
      "blocked"
    ],
    "priority": [
      "low",
      "medium",
      "high",
      "critical"
    ],
    "expected_information_gain": [
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high"
    ],
    "urgency": [
      "low",
      "medium",
      "high"
    ]
  },
  "ApprovalRequest": {
    "approval_type": [
      "interview_dispatch",
      "sensitive_question",
      "subject_designation",
      "hypothesis_closure",
      "finding_approval",
      "final_report_release"
    ],
    "status": [
      "pending",
      "approved",
      "rejected",
      "withdrawn"
    ]
  },
  "AgentRun": {
    "status": [
      "running",
      "completed",
      "failed",
      "rejected_schema",
      "cancelled"
    ]
  },
  "InvestigationJob": {
    "job_type": [
      "transcription",
      "document_parse",
      "claim_extraction",
      "timeline_rebuild",
      "contradiction_scan",
      "hypothesis_review",
      "report_generation"
    ],
    "status": [
      "queued",
      "running",
      "completed",
      "failed"
    ]
  },
  "AuditEvent": {
    "actor_type": [
      "user",
      "agent",
      "system",
      "participant"
    ],
    "operation": [
      "create",
      "update",
      "soft_delete",
      "restore",
      "status_change",
      "approve",
      "reject",
      "export",
      "access"
    ]
  },
  "KnowledgeDocument": {
    "space": [
      "methodology",
      "case"
    ]
  },
  "TrainingCase": {
    "type": [
      "real_public",
      "synthetic",
      "fiction_adapted",
      "internal_anonymized"
    ]
  }
};

/**
 * Возвращает допустимые значения поля или бросает ошибку, если поле не перечисление.
 * @param {string} entity
 * @param {string} field
 * @returns {string[]}
 */
export function enumValues(entity, field) {
  const values = ENUMS[entity]?.[field];
  if (!values) {
    throw new Error(`Поле ${entity}.${field} не является перечислением`);
  }
  return values;
}

/**
 * Проверяет, что значение допустимо для поля-перечисления.
 * @param {string} entity
 * @param {string} field
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidEnumValue(entity, field, value) {
  return typeof value === 'string' && enumValues(entity, field).includes(value);
}
