/**
 * Данные для экранов следователя (§43–§47 ТЗ).
 *
 * Маршруты отдают материал уже связанным: экран не должен склеивать утверждения
 * с доказательствами четырьмя запросами и рисковать показать неполную картину,
 * если один из них не дошёл.
 *
 * Ни один маршрут не скрывает противоречащий материал: доказательство, опровергающее
 * утверждение, приходит в том же ответе, что и подтверждающее (§71 ТЗ).
 */

import { createInvestigationServices } from '../../services/index.js';
import { assertCanWrite } from '../auth.js';

function servicesFor(app, request, caseId) {
  return createInvestigationServices({
    scope: { ...request.scope, caseId },
    pool: app.pool,
    driver: 'postgres',
  });
}

export function registerViewRoutes(app) {
  /**
   * Evidence Matrix (§45 ТЗ): вопрос → утверждение → человек → доказательство →
   * подтверждает или опровергает → состояние.
   */
  app.get('/api/cases/:caseId/matrix', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const r = services.repositories;

    const [issues, claims, evidence, links, persons, sources] = await Promise.all([
      r.issues.list({ case_id: caseId }, { sort: 'code' }),
      r.claims.list({ case_id: caseId }, { sort: 'claim_code' }),
      r.evidence.list({ case_id: caseId }, { sort: 'evidence_code' }),
      r.claimEvidenceLinks.list({ case_id: caseId }),
      r.persons.list({ case_id: caseId }),
      r.sources.list({ case_id: caseId }),
    ]);

    const personById = new Map(persons.map((p) => [p.id, p.name]));
    const evidenceById = new Map(evidence.map((e) => [e.id, e]));
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const linksByClaim = new Map();
    for (const link of links) {
      if (!linksByClaim.has(link.claim_id)) linksByClaim.set(link.claim_id, []);
      linksByClaim.get(link.claim_id).push(link);
    }

    const rows = claims.map((claim) => {
      const claimLinks = linksByClaim.get(claim.id) ?? [];
      return {
        claim_code: claim.claim_code,
        statement: claim.normalized_statement || claim.text,
        person: personById.get(claim.source_person_id) ?? null,
        speaker_certainty: claim.speaker_certainty,
        corroboration_status: claim.corroboration_status,
        verification_status: claim.verification_status,
        time_start: claim.time_start,
        time_end: claim.time_end,
        time_precision: claim.time_precision,
        amount: claim.amount,
        currency: claim.currency,
        // Ссылка на оригинал: без неё строка матрицы недоказуема.
        source: (() => {
          const source = sourceById.get(claim.source_id);
          return source
            ? { id: source.id, type: source.type, title: source.title, locator: claim.source_locator }
            : null;
        })(),
        supporting: claimLinks
          .filter((l) => ['supports', 'partially_supports'].includes(l.relation))
          .map((l) => ({
            code: evidenceById.get(l.evidence_id)?.evidence_code,
            relation: l.relation,
            strength: l.strength,
            explanation: l.explanation,
          })),
        contradicting: claimLinks
          .filter((l) => l.relation === 'contradicts')
          .map((l) => ({
            code: evidenceById.get(l.evidence_id)?.evidence_code,
            strength: l.strength,
            explanation: l.explanation,
          })),
      };
    });

    return {
      issues: issues.map((i) => ({ code: i.code, question: i.question, status: i.status })),
      evidence: evidence.map((e) => ({
        code: e.evidence_code,
        description: e.description,
        reliability: e.reliability,
        integrity: e.integrity,
        source_id: e.source_id,
      })),
      rows,
    };
  });

  /**
   * Timeline (§44 ТЗ). Конкурирующие версии времени отдаются вместе с событием:
   * экран обязан показать, что версия не одна.
   */
  app.get('/api/cases/:caseId/timeline', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const r = services.repositories;

    const [events, claims, persons, evidence] = await Promise.all([
      r.events.list({ case_id: caseId }, { sort: 'event_code' }),
      r.claims.list({ case_id: caseId }),
      r.persons.list({ case_id: caseId }),
      r.evidence.list({ case_id: caseId }),
    ]);

    const claimById = new Map(claims.map((c) => [c.id, c]));
    const personById = new Map(persons.map((p) => [p.id, p.name]));
    const evidenceById = new Map(evidence.map((e) => [e.id, e.evidence_code]));

    return {
      events: events.map((e) => ({
        code: e.event_code,
        type: e.event_type,
        description: e.description,
        start_at: e.start_at,
        end_at: e.end_at,
        time_precision: e.time_precision,
        location: e.location,
        confidence: e.confidence,
        participants: (e.participant_person_ids ?? []).map((id) => personById.get(id)).filter(Boolean),
        source_claims: (e.source_claim_ids ?? []).map((id) => {
          const claim = claimById.get(id);
          return claim ? {
            code: claim.claim_code,
            statement: claim.normalized_statement || claim.text,
            said_by: personById.get(claim.source_person_id) ?? null,
            corroboration_status: claim.corroboration_status,
          } : null;
        }).filter(Boolean),
        supporting_evidence: (e.supporting_evidence_ids ?? [])
          .map((id) => evidenceById.get(id)).filter(Boolean),
        competing_versions: e.competing_versions ?? [],
      })),
    };
  });

  /** Contradiction Map (§46 ТЗ): карточка противоречия с обеими сторонами и проверками. */
  app.get('/api/cases/:caseId/contradictions', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const r = services.repositories;

    const [contradictions, claims, persons, links, evidence] = await Promise.all([
      r.contradictions.list({ case_id: caseId }, { sort: 'contradiction_code' }),
      r.claims.list({ case_id: caseId }),
      r.persons.list({ case_id: caseId }),
      r.claimEvidenceLinks.list({ case_id: caseId }),
      r.evidence.list({ case_id: caseId }),
    ]);

    const claimById = new Map(claims.map((c) => [c.id, c]));
    const personById = new Map(persons.map((p) => [p.id, p.name]));
    const evidenceById = new Map(evidence.map((e) => [e.id, e.evidence_code]));

    function side(claimId) {
      const claim = claimById.get(claimId);
      if (!claim) return null;
      return {
        code: claim.claim_code,
        statement: claim.normalized_statement || claim.text,
        said_by: personById.get(claim.source_person_id) ?? null,
        corroboration_status: claim.corroboration_status,
        evidence: links.filter((l) => l.claim_id === claimId)
          .map((l) => ({ code: evidenceById.get(l.evidence_id), relation: l.relation })),
      };
    }

    return {
      contradictions: contradictions.map((x) => ({
        id: x.id,
        code: x.contradiction_code,
        type: x.type,
        severity: x.severity,
        description: x.description,
        resolution_status: x.resolution_status,
        resolution_note: x.resolution_note,
        claim_a: side(x.claim_a_id),
        claim_b: side(x.claim_b_id),
        // Независимое доказательство показывается явно, включая его отсутствие:
        // пустой список здесь — важный факт, а не пустое место на экране.
        independent_evidence: links
          .filter((l) => [x.claim_a_id, x.claim_b_id].includes(l.claim_id))
          .map((l) => evidenceById.get(l.evidence_id))
          .filter(Boolean),
        recommended_checks: x.recommended_checks ?? [],
      })),
    };
  });

  /** Hypothesis Board (§47 ТЗ): версии по колонкам состояний. */
  app.get('/api/cases/:caseId/hypotheses', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const r = services.repositories;

    const [hypotheses, revisions] = await Promise.all([
      r.hypotheses.list({ case_id: caseId }, { sort: 'code' }),
      r.hypothesisRevisions.list({ case_id: caseId }),
    ]);

    return {
      hypotheses: hypotheses.map((h) => {
        let redTeam = null;
        let defence = null;
        try { redTeam = h.red_team_notes ? JSON.parse(h.red_team_notes) : null; } catch { redTeam = null; }
        try { defence = h.defence_review_notes ? JSON.parse(h.defence_review_notes) : null; } catch { defence = null; }

        return {
          code: h.code,
          description: h.description,
          type: h.type,
          status: h.status,
          confidence: h.confidence,
          evidence_that_would_support: h.evidence_that_would_support ?? [],
          evidence_that_would_contradict: h.evidence_that_would_contradict ?? [],
          missing_evidence: h.missing_evidence ?? [],
          alternative_explanations: h.alternative_explanations ?? [],
          red_team: redTeam,
          defence_review: defence,
          // История статусов показывает, что версия не была «всегда такой»:
          // это защищает от ретроспективного искажения хода расследования.
          history: revisions
            .filter((rev) => rev.hypothesis_id === h.id)
            .sort((a, b) => Number(a.revision) - Number(b.revision))
            .map((rev) => ({
              revision: rev.revision,
              from: rev.old_status,
              to: rev.new_status,
              reason: rev.reason,
              at: rev.changed_at,
            })),
        };
      }),
    };
  });

  /** Flow of Funds (§19, §33 ТЗ): ожидаемая и фактическая цепочки рядом. */
  app.get('/api/cases/:caseId/money-flow', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const r = services.repositories;

    const [edges, transactions] = await Promise.all([
      r.moneyFlowEdges.list({ case_id: caseId }, { sort: 'sequence' }),
      r.transactions.list({ case_id: caseId }, { sort: 'transaction_code' }),
    ]);

    const map = (list) => list.map((e) => ({
      sequence: e.sequence,
      from: e.source_entity,
      to: e.destination_entity,
      amount: e.amount,
      currency: e.currency,
      occurred_at: e.occurred_at,
      time_precision: e.time_precision,
      verification_status: e.verification_status,
      notes: e.notes,
      evidence_count: (e.evidence_ids ?? []).length,
    }));

    return {
      expected: map(edges.filter((e) => e.flow_type === 'expected')),
      actual: map(edges.filter((e) => e.flow_type === 'actual')),
      transactions: transactions.map((t) => ({
        code: t.transaction_code,
        payer: t.payer,
        receiver: t.receiver,
        amount: t.amount,
        currency: t.currency,
        actual_at: t.actual_at,
        verification_status: t.verification_status,
      })),
    };
  });

  /** Люди дела и их интервью: нужен для запуска опроса с экрана. */
  app.get('/api/cases/:caseId/persons', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    const [persons, interviews, questions, approvals] = await Promise.all([
      services.repositories.persons.list({ case_id: caseId }),
      services.repositories.interviews.list({ case_id: caseId }),
      services.repositories.questions.list({ case_id: caseId }),
      services.repositories.approvals.list({
        case_id: caseId, approval_type: 'interview_dispatch', status: 'approved',
      }),
    ]);

    const approvedInterviewIds = new Set(approvals.flatMap(
      (a) => [a.object_id, ...(a.payload?.interview_ids ?? [])].filter(Boolean),
    ));

    return {
      persons: persons.map((p) => ({
        id: p.id,
        name: p.name,
        job_title: p.job_title,
        participant_type: p.participant_type,
        relationship_to_incident: p.relationship_to_incident,
        interviews: interviews
          .filter((i) => i.person_id === p.id)
          .map((i) => {
            const own = questions.filter((q) => q.interview_id === i.id);
            return {
              id: i.id,
              round: i.round,
              status: i.status,
              channel: i.channel,
              // Следователю нужно видеть не только что интервью создано, но и что из
              // него дошло до участника: интервью с утверждённой отправкой и нулём
              // открытых вопросов — это ссылка на пустой экран.
              questions_total: own.length,
              questions_open: own.filter(
                (q) => ['approved', 'asked', 'answered'].includes(q.status),
              ).length,
              questions_sensitive_pending: own.filter(
                (q) => q.sensitive && q.status === 'draft',
              ).length,
              dispatch_approved: approvedInterviewIds.has(i.id),
            };
          }),
      })),
    };
  });

  /**
   * Разрешение противоречия человеком.
   *
   * Закрыть противоречие может только человек и только с объяснением: противоречие,
   * помеченное разрешённым без причины, исчезает из поля зрения, не будучи разрешённым.
   */
  app.post('/api/cases/:caseId/contradictions/:contradictionId/resolve', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId, contradictionId } = request.params;
    const { status, note } = request.body ?? {};

    if (!['resolved', 'unresolvable', 'under_investigation', 'open'].includes(status)) {
      return reply.code(400).send({ error: 'Недопустимое состояние противоречия' });
    }
    if (status !== 'open' && !note) {
      return reply.code(400).send({ error: 'Изменение состояния противоречия требует объяснения' });
    }

    const services = servicesFor(app, request, caseId);
    const contradiction = await services.repositories.contradictions.get(contradictionId);
    if (!contradiction || contradiction.case_id !== caseId) {
      return reply.code(404).send({ error: 'Противоречие не найдено' });
    }

    return services.repositories.contradictions.update(contradictionId, {
      resolution_status: status,
      resolution_note: note ?? null,
      resolved_by: status === 'open' ? null : request.scope.userId,
    });
  });

  /** Изменение состояния задачи расследования. */
  app.post('/api/cases/:caseId/tasks/:taskId/status', async (request, reply) => {
    assertCanWrite(request.scope);
    const { caseId, taskId } = request.params;
    const { status } = request.body ?? {};
    if (!['proposed', 'accepted', 'in_progress', 'completed', 'cancelled', 'blocked'].includes(status)) {
      return reply.code(400).send({ error: 'Недопустимое состояние задачи' });
    }
    const services = servicesFor(app, request, caseId);
    const task = await services.repositories.tasks.get(taskId);
    if (!task || task.case_id !== caseId) return reply.code(404).send({ error: 'Задача не найдена' });
    return services.repositories.tasks.update(taskId, { status });
  });

  /** Задачи расследования и рекомендованные действия. */
  app.get('/api/cases/:caseId/tasks', async (request) => {
    const { caseId } = request.params;
    const services = servicesFor(app, request, caseId);
    return {
      tasks: await services.repositories.tasks.list({ case_id: caseId }, { sort: '-created_at' }),
    };
  });
}
