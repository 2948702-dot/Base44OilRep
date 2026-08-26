/**
 * JSON-схемы выходов агентов.
 *
 * Критическим агентам запрещено возвращать только прозу (§62 ТЗ). Схема — это не украшение:
 * ответ, который её не проходит, считается неуспешным запуском и не попадает в дело.
 */

import { z } from 'zod';
import { CONFIDENCE_LEVELS } from '../domain/confidence.js';
import {
  HYPOTHESIS_STATUS,
  HYPOTHESIS_TYPE,
  SPEAKER_CERTAINTY,
  CLAIM_TYPE,
  TIME_PRECISION,
  QUESTION_TYPE,
} from '../domain/enums.js';

const confidence = z.enum(/** @type {[string, ...string[]]} */ (CONFIDENCE_LEVELS));

/** Наблюдение агента о самом материале, включая попытки подмены инструкций. */
const observations = z.array(z.string()).default([]);

export const CaseStateSchema = z.object({
  case_state: z.object({
    current_stage: z.string(),
    stage_rationale: z.string(),
    readiness: z.enum(['blocked', 'partial', 'ready']),
  }),
  next_actions: z.array(z.object({
    action: z.string(),
    agent: z.string().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    reason: z.string(),
    expected_information_gain: confidence,
    requires_human_approval: z.boolean(),
  })),
  required_agents: z.array(z.string()),
  blocking_issues: z.array(z.object({
    issue: z.string(),
    blocks: z.string(),
    resolution: z.string(),
  })),
  observations,
});

export const IntakeAnalysisSchema = z.object({
  persons: z.array(z.object({
    name: z.string(),
    role: z.string().nullable().optional(),
    job_title: z.string().nullable().optional(),
    organization: z.string().nullable().optional(),
    participant_type: z.string(),
    relationship_to_incident: z.string().nullable().optional(),
    mentioned_as: z.string(),
  })),
  organizations: z.array(z.object({
    name: z.string(),
    role: z.string().nullable().optional(),
  })),
  allegations: z.array(z.object({
    description: z.string(),
    amount: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    stated_by: z.string().nullable().optional(),
  })),
  dates: z.array(z.object({
    text: z.string(),
    normalized_start: z.string().nullable(),
    normalized_end: z.string().nullable(),
    precision: z.enum(/** @type {[string, ...string[]]} */ (TIME_PRECISION)),
  })),
  amounts: z.array(z.object({
    text: z.string(),
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    precision: z.enum(['exact', 'approximate', 'unknown']),
  })),
  locations: z.array(z.string()),
  known_sources: z.array(z.object({
    description: z.string(),
    type: z.string(),
    availability: z.enum(['available', 'claimed', 'unknown']),
  })),
  unknowns: z.array(z.string()),
  observations,
});

export const InvestigationPlanSchema = z.object({
  issues: z.array(z.object({
    question: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    related_allegations: z.array(z.string()).default([]),
  })).min(1),
  hypotheses: z.array(z.object({
    description: z.string(),
    type: z.enum(/** @type {[string, ...string[]]} */ (HYPOTHESIS_TYPE)),
    evidence_that_would_support: z.array(z.string()).min(1),
    evidence_that_would_contradict: z.array(z.string()).min(1),
    addresses_issues: z.array(z.string()).default([]),
  })).min(3),
  objectives: z.array(z.string()).min(1),
  evidence_requests: z.array(z.object({
    description: z.string(),
    source_type: z.string(),
    holder: z.string().nullable().optional(),
    resolves: z.array(z.string()).default([]),
    expected_information_gain: confidence,
    urgency: z.enum(['low', 'medium', 'high']),
  })),
  interview_order: z.array(z.object({
    person: z.string(),
    round: z.number().int().positive(),
    reason: z.string(),
  })),
  investigative_tasks: z.array(z.object({
    title: z.string(),
    task_type: z.string(),
    reason: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
  })),
  observations,
});

export const ClaimExtractionSchema = z.object({
  claims: z.array(z.object({
    text: z.string(),
    normalized_statement: z.string(),
    claim_type: z.enum(/** @type {[string, ...string[]]} */ (CLAIM_TYPE)),
    subject_entity: z.string().nullable(),
    predicate: z.string().nullable(),
    object_entity: z.string().nullable(),
    time_start: z.string().nullable(),
    time_end: z.string().nullable(),
    time_precision: z.enum(/** @type {[string, ...string[]]} */ (TIME_PRECISION)),
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    location: z.string().nullable(),
    speaker_certainty: z.enum(/** @type {[string, ...string[]]} */ (SPEAKER_CERTAINTY)),
    ai_extraction_confidence: confidence,
    source_locator: z.object({
      char_start: z.number().int().nullable().optional(),
      char_end: z.number().int().nullable().optional(),
      page: z.number().int().nullable().optional(),
      line: z.number().int().nullable().optional(),
      timestamp: z.string().nullable().optional(),
      message_id: z.string().nullable().optional(),
      row_id: z.string().nullable().optional(),
    }),
  })),
  unresolved_references: z.array(z.string()).default([]),
  observations,
});

export const HypothesisAnalysisSchema = z.object({
  analyses: z.array(z.object({
    hypothesis_code: z.string(),
    status: z.enum(/** @type {[string, ...string[]]} */ (HYPOTHESIS_STATUS)),
    supporting_claim_ids: z.array(z.string()).default([]),
    supporting_evidence_ids: z.array(z.string()).default([]),
    contradicting_claim_ids: z.array(z.string()).default([]),
    contradicting_evidence_ids: z.array(z.string()).default([]),
    unexplained_evidence: z.array(z.string()).default([]),
    missing_evidence: z.array(z.string()).default([]),
    alternative_explanations: z.array(z.string()).default([]),
    confidence,
    status_change_reason: z.string(),
  })),
  observations,
});

export const RedTeamReviewSchema = z.object({
  primary_hypothesis_reviewed: z.string(),
  alternative_explanations: z.array(z.object({
    description: z.string(),
    plausibility: confidence,
    would_be_supported_by: z.array(z.string()).min(1),
    currently_ruled_out_by: z.array(z.string()).default([]),
  })).min(1),
  reasoning_flaws: z.array(z.object({
    flaw_type: z.enum([
      'cherry_picking',
      'confirmation_bias',
      'overlooked_evidence',
      'incorrect_inference',
      'missing_witness',
      'mistaken_identity',
      'accounting_error',
      'technical_error',
      'unsupported_leap',
    ]),
    description: z.string(),
    affected_claims: z.array(z.string()).default([]),
    what_would_settle_it: z.string(),
  })),
  overlooked_evidence: z.array(z.string()).default([]),
  verdict: z.enum([
    'primary_hypothesis_survives',
    'primary_hypothesis_weakened',
    'primary_hypothesis_should_not_stand',
  ]),
  verdict_reason: z.string(),
  observations,
});

export const AGENT_OUTPUT_SCHEMAS = {
  CaseStateSchema,
  IntakeAnalysisSchema,
  InvestigationPlanSchema,
  ClaimExtractionSchema,
  HypothesisAnalysisSchema,
  RedTeamReviewSchema,
};
