/**
 * Приёмочный прогон платформы расследований (§81 ТЗ).
 *
 * Запуск: node investigation/tools/acceptance.mjs [--postgres]
 *
 * По умолчанию прогон идёт на драйвере хранения в памяти и на stub-модели с заранее
 * заданными ответами. С флагом --postgres тот же сценарий выполняется против настоящей
 * базы: это проверяет не только методологию, но и то, что схема, внешние ключи и
 * политики RLS не мешают нормальной работе расследования.
 *
 * Проверяется не качество формулировок модели, а то, что система структурно не позволяет
 * нарушить методологию: превратить приблизительное время в точное, схлопнуть конкурирующие
 * версии времени, исключить версию решением агента, раскрыть участнику чужие показания
 * без пометки, выпустить факт без доказательства.
 *
 * Часть заготовленных ответов агентов намеренно содержит нарушения — они нужны, чтобы
 * убедиться, что система их не пропускает.
 */

import { createMemoryStore, createPool, withTenant } from '../../src/investigation/repositories/index.js';
import { createInvestigationServices } from '../../src/investigation/services/index.js';
import { createStubLlmClient } from '../../src/investigation/agents/framework/llmClient.js';
import { MISSING_CASH_001 } from '../../src/investigation/fixtures/missingCash001.js';
import { evaluateTransition } from '../../src/investigation/engine/stages.js';
import {
  assertFindingHasEvidence,
  assertHypothesisClosureAllowed,
  assertPrecisionNotInflated,
} from '../../src/investigation/engine/invariants.js';
import * as stub from './fixtures/stub-outputs.mjs';

const USE_POSTGRES = process.argv.includes('--postgres');

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
}

/** Ожидает, что действие будет отклонено, и возвращает текст отказа. */
async function expectRejected(action) {
  try {
    await action();
    return null;
  } catch (error) {
    return error.message;
  }
}

/**
 * Прямое чтение содержимого хранилища для проверок, минуя область видимости дела.
 */
async function dump(backend, entity) {
  if (backend.store) {
    return [...(backend.store.tables.get(entity)?.values() ?? [])];
  }
  const { SCHEMA } = await import('../../src/investigation/repositories/postgres/schema.generated.js');
  return withTenant(
    backend.pool,
    { organizationId: backend.organizationId },
    (client) => client.query(`select * from ${SCHEMA[entity].table}`).then((r) => r.rows),
  );
}

/**
 * Готовит хранилище прогона. Для PostgreSQL создаётся организация и пользователь:
 * внешние ключи схемы не примут выдуманные идентификаторы, и это правильно.
 */
async function setupBackend() {
  if (!USE_POSTGRES) {
    return { store: createMemoryStore(), organizationId: 'org_1', actorId: 'user_investigator' };
  }

  const pool = createPool();
  const created = await withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const stamp = Date.now();
    const org = await client.query(
      "insert into organization (name, slug, status) values ($1, $2, 'active') returning id",
      [`Приёмка ${stamp}`, `acceptance-${stamp}`],
    );
    const organizationId = org.rows[0].id;
    const user = await client.query(
      "insert into app_user (organization_id, role, full_name, status) "
      + "values ($1, 'investigator', $2, 'active') returning id",
      [organizationId, 'Следователь приёмки'],
    );
    return { organizationId, actorId: user.rows[0].id };
  });

  return { pool, ...created };
}

/**
 * Ответы модели идут в том порядке, в котором сервисы вызывают агентов.
 * Порядок повторяет цикл расследования §67 ТЗ.
 */
const LLM_RESPONSES = [
  stub.INTAKE_OUTPUT,                  // 02 intake_analyst
  stub.PLAN_OUTPUT,                    // 03 investigation_planner
  stub.STRATEGY_IVANOV,                // 05 interview_strategist
  stub.CLAIMS_IVANOV,                  // 07 claim_extractor
  stub.INTERVIEWER_TURN_OUTPUT,        // 06 ai_interviewer
  stub.STRATEGY_PETROVA,               // 05 interview_strategist
  stub.CLAIMS_PETROVA,                 // 07 claim_extractor
  stub.TIMELINE_OUTPUT,                // 08 timeline_analyst
  stub.CONTRADICTIONS_OUTPUT,          // 09 contradiction_analyst
  stub.CORROBORATION_OUTPUT,           // 10 corroboration_agent
  stub.HYPOTHESIS_REVIEW_OUTPUT,       // 12 hypothesis_analyst
  stub.RED_TEAM_OUTPUT,                // 13 red_team_investigator
  stub.FOLLOW_UP_OUTPUT,               // 15 follow_up_planner
  stub.FINAL_REVIEW_OUTPUT,            // 17 final_reviewer
  stub.DEFENCE_REVIEW_OUTPUT,          // 14 defence_reviewer
  stub.ROOT_CAUSE_OUTPUT,              // 16 root_cause_analyst
  stub.REPORT_OUTPUT,                  // 18 report_writer
  stub.REPORT_CITING_UNKNOWN_FINDING,  // 18 повторно: ссылка на несуществующий вывод
  stub.FINAL_REVIEW_FACT_WITHOUT_EVIDENCE, // 17 повторно: факт без доказательства
  stub.DEFENCE_REVIEW_REJECTING,       // 14 повторно: конструкция несостоятельна
  stub.HYPOTHESIS_REVIEW_ELIMINATING,  // 12 повторно: попытка исключить версию
];

async function main() {
  const backend = await setupBackend();
  const scope = {
    organizationId: backend.organizationId,
    actorId: backend.actorId,
    actorType: 'user',
  };
  const storage = backend.store
    ? { store: backend.store, driver: 'memory' }
    : { pool: backend.pool, driver: 'postgres' };

  const llm = createStubLlmClient(LLM_RESPONSES);
  const services = createInvestigationServices({ scope, ...storage, llm });

  // ───────────────────────── Создание дела ─────────────────────────

  const investigationCase = await services.cases.createCase({
    title: MISSING_CASH_001.title,
    description: MISSING_CASH_001.description,
    caseType: MISSING_CASH_001.case_type,
    severity: MISSING_CASH_001.severity,
    estimatedLoss: MISSING_CASH_001.estimated_loss,
    currency: MISSING_CASH_001.currency,
    location: MISSING_CASH_001.location,
    incidentStartAt: MISSING_CASH_001.incident_start_at,
    incidentEndAt: MISSING_CASH_001.incident_end_at,
    incidentTimePrecision: MISSING_CASH_001.incident_time_precision,
  });
  const caseId = investigationCase.id;
  const caseScope = { ...scope, caseId };
  const app = createInvestigationServices({ scope: caseScope, ...storage, llm });

  check('Дело создано с номером и стадией intake',
    investigationCase.case_number?.startsWith('CASE-') && investigationCase.current_stage === 'intake',
    investigationCase.case_number);

  // ───────────────────────── Приём заявления ─────────────────────────

  const intake = await app.cases.runIntake(caseId, { description: MISSING_CASH_001.description });
  check('Intake извлёк участников и заявления',
    intake.persons.length === 4 && intake.allegations.length === 2);
  check('После intake никто не признан виновным: нет participant_type = subject',
    intake.persons.every((p) => p.participant_type !== 'subject'));
  check('Intake сохранил неизвестное как неизвестное', intake.unknowns.length > 0);

  // ───────────────────────── Планирование ─────────────────────────

  const plan = await app.cases.runPlanning(caseId);
  check('Создано не менее трёх альтернативных версий', plan.hypotheses.length >= 3,
    `версий: ${plan.hypotheses.length}`);
  check('Версии различаются по типу', new Set(plan.hypotheses.map((h) => h.type)).size >= 3);
  check('Каждая версия имеет опровергающее доказательство',
    plan.hypotheses.every((h) => (h.evidence_that_would_contradict ?? []).length > 0));
  check('Запрошены независимые доказательства', plan.tasks.length >= 2);
  check('История статусов гипотез записана',
    (await dump(backend, 'HypothesisRevision')).length === plan.hypotheses.length);

  let snapshot = await app.cases.getSnapshot(caseId);
  check('Переход intake → planning разрешён после intake',
    evaluateTransition('intake', 'planning', snapshot).allowed);
  check('Переход planning → interview_round заблокирован без утверждения человеком',
    evaluateTransition('planning', 'interview_round', snapshot).allowed === false);

  // ───────────────────────── Раунд 1: интервью ─────────────────────────

  const ivanov = intake.persons.find((p) => p.name === 'Иванов Сергей');
  const petrova = intake.persons.find((p) => p.name === 'Петрова Елена');

  const planned = await app.interviews.planInterview({ personId: ivanov.id, round: 1 });
  check('Стратег выделил, что нельзя раскрывать участнику',
    planned.plan.information_not_to_reveal_yet.length >= 2,
    `пунктов: ${planned.plan.information_not_to_reveal_yet.length}`);
  check('План интервью начинается с открытого вопроса',
    planned.questions[0].question_type === 'open');
  check('План хранит цели интервью и ссылку на запуск агента',
    Boolean(planned.interview.interview_plan.objectives?.length)
    && Boolean(planned.interview.interview_plan.agent_run_id));

  const tokenBlocked = await expectRejected(
    () => app.interviews.issueAccessToken(planned.interview.id, { baseUrl: 'https://example.test' }),
  );
  check('Ссылка на интервью не выдаётся без утверждения человеком', Boolean(tokenBlocked));

  const approval = await app.cases.requestInterviewDispatchApproval(caseId, [planned.interview.id]);
  await app.approvals.decide(approval.id, 'approved', 'Состав первого раунда проверен');

  const issued = await app.interviews.issueAccessToken(planned.interview.id, {
    baseUrl: 'https://example.test',
  });
  check('Ссылка выдана после утверждения и токен хранится только хэшем',
    Boolean(issued.token) && issued.record.token_hash !== issued.token
      && issued.record.token_hash.length === 64);

  const spareInterview = await app.interviews.createInterview({
    personId: petrova.id, channel: 'web', round: 1,
  });
  const closedFirst = await expectRejected(() => app.interviews.addQuestions(
    spareInterview.id,
    [{ question: 'Вы брали деньги?', question_type: 'challenge' }],
  ));
  check('Обвинительный вопрос первым отклонён', Boolean(closedFirst));

  const answerIvanov = await app.interviews.submitAnswer({
    questionId: planned.questions[0].id,
    personId: ivanov.id,
    text: 'Около семи я приехал на базу и передал Лене примерно 74 тысячи.',
  });
  check('Оригинал ответа сохранён как источник', Boolean(answerIvanov.original_source_id));

  const extraction = await app.interviews.extractClaims(answerIvanov.id);
  check('Ответ разобран на атомарные утверждения', extraction.claims.length >= 2);
  check('Каждое утверждение ссылается на источник и позицию в нём',
    extraction.claims.every((c) => c.source_id && c.source_locator
      && Object.values(c.source_locator).some((v) => v !== null && v !== undefined)));
  check('Приблизительное время не превращено в точное',
    extraction.claims.every((c) => c.time_precision !== 'exact' && c.speaker_certainty !== 'certain'));
  check('Неоднозначная ссылка зафиксирована, а не додумана',
    extraction.unresolvedReferences.length > 0);

  const turn = await app.interviews.continueInterview(planned.interview.id);
  check('AI Interviewer уточняет границы приблизительного времени',
    turn.questions.some((q) => q.question_type === 'clarification'));
  check('AI Interviewer запрашивает подтверждающие материалы',
    turn.questions.some((q) => q.question_type === 'corroboration'));
  check('Интервью не закрывается, пока цели не покрыты', turn.complete === false);

  // Второй участник
  const plannedPetrova = await app.interviews.planInterview({ personId: petrova.id, round: 1 });
  await app.interviews.issueAccessToken(plannedPetrova.interview.id, { baseUrl: 'https://example.test' });
  const answerPetrova = await app.interviews.submitAnswer({
    questionId: plannedPetrova.questions[0].id,
    personId: petrova.id,
    text: 'Никаких денег в тот день мне никто не передавал, я ушла со смены в половине седьмого.',
  });
  const extractionPetrova = await app.interviews.extractClaims(answerPetrova.id);
  check('Показания второго участника извлечены', extractionPetrova.claims.length >= 2);
  check('Отрицание сохранено как утверждение, а не как отсутствие данных',
    extractionPetrova.claims.some((c) => c.claim_type === 'denial'));

  // Материал приобщается как доказательство: без него ни один вывод не может быть
  // фактом, и это правильно.
  const answerSource = await app.repositories.sources.get(answerIvanov.original_source_id);
  const evidence = await app.sources.promoteToEvidence(answerSource.id, {
    type: 'testimony',
    description: 'Первичное объяснение капитана, полученное по подписанной ссылке',
    relevance: 'high',
    reliability: 'moderate',
  });
  check('Источник приобщён как доказательство с сохранением хэша',
    evidence.evidence_code === 'E-001' && evidence.original_hash === answerSource.sha256);

  // ───────────────────────── Аналитический цикл ─────────────────────────

  const cycle = await app.analysis.runAnalysisCycle(caseId, { caseService: app.cases });

  check('Хронология построена из утверждений', cycle.timeline.events.length >= 2);
  check('Каждое событие опирается на утверждение',
    cycle.timeline.events.every((e) => (e.source_claim_ids ?? []).length > 0));
  check('Конкурирующие версии времени сохранены, а не схлопнуты в одну',
    cycle.timeline.events.some((e) => (e.competing_versions ?? []).length > 0),
    `событий с альтернативами: ${cycle.timeline.events.filter((e) => (e.competing_versions ?? []).length > 0).length}`);
  check('Разрыв в хронологии зафиксирован', cycle.timeline.gaps.length > 0);

  check('Найдено ключевое противоречие', cycle.contradictions.contradictions.length >= 2);
  check('Найдено критическое противоречие о передаче денег',
    cycle.contradictions.contradictions.some((c) => c.severity === 'critical' && c.type === 'direct'));

  check('Утверждения получили оценку подтверждённости',
    cycle.corroboration.claims.length === 4);
  check('Взаимно противоречащие показания не подтверждают друг друга',
    cycle.corroboration.claims.filter((c) => c.corroboration_status === 'contradicted').length === 2);
  check('Утверждение без объективного материала не считается проверенным',
    cycle.corroboration.claims.every(
      (c) => c.verification_status !== 'verified'
        || (c.claim_code === 'C-001')),
    'попытка объявить C-004 проверенным понижена до partially_verified');
  check('Создана связь утверждения с доказательством',
    cycle.corroboration.links.length === 1
      && cycle.corroboration.links[0].relation === 'partially_supports');
  check('Для каждого противоречия предложена проверка',
    cycle.contradictions.contradictions.every((c) => (c.recommended_checks ?? []).length > 0));

  check('Версии пересмотрены', cycle.review.hypotheses.length === 4);
  check('Основная версия ослаблена, а не подтверждена автоматически',
    cycle.review.hypotheses.find((h) => h.type === 'primary')?.status === 'weakened');
  check('Альтернативные версии сохранены после пересмотра',
    cycle.review.hypotheses.filter((h) => h.status !== 'eliminated').length === 4);
  check('Смена статуса записана в историю версии',
    (await dump(backend, 'HypothesisRevision')).length > plan.hypotheses.length);
  check('Уверенность выражена качественной шкалой',
    cycle.review.hypotheses.every((h) => ['very_low', 'low', 'moderate', 'high', 'very_high'].includes(h.confidence)));

  check('Red Team предложил минимум одну правдоподобную альтернативу',
    cycle.redTeam.review.alternative_explanations.length >= 1);
  check('Каждая альтернатива Red Team проверяема конкретным доказательством',
    cycle.redTeam.review.alternative_explanations.every((a) => a.would_be_supported_by.length > 0));
  check('Red Team породил задачи расследования', cycle.redTeam.tasks.length >= 1);

  // ───────────────────────── Планирование раунда 2 ─────────────────────────

  check('Спланирован следующий раунд', cycle.followUp.planned.length >= 2);
  check('Вопрос, раскрывающий чужие показания, помечен как чувствительный',
    cycle.followUp.planned
      .flatMap((p) => p.questions)
      .filter((q) => q.sensitive).length >= 1);
  check('Запрошено недостающее доказательство', cycle.followUp.tasks.length >= 1);
  check('Цикл не остановлен при нерешённых вопросах',
    cycle.followUp.recommendStop === false && cycle.nextRoundNeeded?.continue === true,
    `нерешённого: ${JSON.stringify(cycle.nextRoundNeeded?.unresolved ?? {})}`);

  const round2 = await app.interviews.startRound(cycle.followUp);
  check('Интервью второго раунда созданы', round2.length === cycle.followUp.planned.length);
  check('Раунд 2 тоже начинается с открытого вопроса',
    round2.every((r) => r.questions[0].question_type === 'open'));
  check('Раунд второго интервью проставлен',
    round2.every((r) => r.interview.round === cycle.followUp.round));

  // ───────────────────────── Итоговый отчёт ─────────────────────────

  const finalReview = await app.reports.runFinalReview(caseId);
  check('Выводы разложены по степени обоснованности', finalReview.findings.length === 4);
  check('Установленный факт имеет ссылку на доказательство',
    finalReview.findings
      .filter((f) => f.finding_type === 'fact')
      .every((f) => (f.supporting_evidence_ids ?? []).length > 0));
  check('Спорный эпизод не превращён в факт',
    finalReview.findings.some((f) => f.finding_type === 'unresolved'
      && f.statement.includes('Петрова')));
  check('Неразрешённые вопросы перечислены, а не умолчаны',
    finalReview.unresolvedQuestions.length >= 2);
  check('Готовность отчёта оценена отдельно от наличия выводов',
    finalReview.readiness === 'not_ready', finalReview.readinessReason);
  check('Выводы созданы черновиками и ждут человека',
    finalReview.findings.every((f) => f.review_status === 'draft'));

  // ───────────────────────── Защитная проверка ─────────────────────────

  const defence = await app.reports.runDefenceReview(caseId, ivanov.id);
  check('Защитная проверка нашла слабости доказательственной конструкции',
    defence.review.weaknesses.length >= 2);
  check('Каждая слабость сопровождается способом её закрыть',
    defence.review.weaknesses.every((w) => w.what_would_close_it));
  check('Слабости превращены в задачи расследования', defence.tasks.length === defence.review.weaknesses.length);
  check('Итог защитной проверки записан в затронутые выводы',
    defence.findings.length >= 1
      && defence.findings.every((f) => f.defence_review_verdict === 'conclusions_require_more_evidence'));

  // ───────────────────────── Корневые причины ─────────────────────────

  const rootCause = await app.reports.runRootCause(caseId);
  check('Корневая причина не сводится к поведению человека',
    rootCause.analysis.root_causes.every(
      (c) => !/иванов|петрова|капитан|администратор/i.test(c.cause)),
    rootCause.analysis.root_causes[0]?.cause?.slice(0, 60) ?? '');
  check('Отказы контроля разобраны по схеме «ожидалось — было — почему»',
    rootCause.analysis.control_failures.every(
      (f) => f.expected_behaviour && f.actual_behaviour && f.why_it_failed));
  check('Причины и отказы контроля сохранены выводами',
    rootCause.findings.some((f) => f.finding_type === 'root_cause')
      && rootCause.findings.some((f) => f.finding_type === 'procedural_failure'));
  check('Меры относятся к порядку работы, а не к наказанию людей',
    rootCause.tasks.every((t) => !/уволить|наказать|взыскать|дисциплинарн|лишить премии/i.test(t.title)));

  const reportWithoutApproval = await expectRejected(() => app.reports.generateReport(caseId));
  check('Отчёт не составляется из неутверждённых выводов',
    reportWithoutApproval?.includes('REPORT_REQUIRES_APPROVED_FINDINGS'), reportWithoutApproval ?? '');

  for (const finding of finalReview.findings) {
    await app.reports.approveFinding(finding.id, 'Проверено следователем');
  }
  for (const finding of rootCause.findings) {
    await app.reports.approveFinding(finding.id, 'Проверено следователем');
  }
  const report = await app.reports.generateReport(caseId, {
    unresolvedQuestions: finalReview.unresolvedQuestions,
  });
  check('Отчёт составлен по утверждённым выводам',
    report.status === 'draft' && report.version === 1);
  check('Каждое утверждение отчёта ссылается на вывод',
    report.cited_finding_codes.length > 0
      && report.cited_finding_codes.every((code) => /^F-\d+$/.test(code)));
  check('В отчёте есть все обязательные разделы §40 ТЗ',
    ['executive_summary', 'scope', 'methodology', 'incident', 'persons', 'timeline',
      'established_facts', 'claims', 'contradictions', 'hypothesis_analysis',
      'unresolved_questions', 'recommended_actions', 'appendices']
      .every((section) => report.sections[section] !== undefined));
  check('Факты и заявления разведены по разным разделам',
    report.sections.established_facts.length > 0 && report.sections.claims.length > 0);
  check('Раздел неразрешённых вопросов не пуст',
    report.sections.unresolved_questions.length >= 2);
  check('Рекомендации касаются порядка работы, а не наказания людей',
    report.sections.recommended_actions.every(
      (a) => !/уволить|наказать|взыскать|дисциплинарн/i.test(a.action)));

  const releaseBlocked = await expectRejected(() => app.reports.releaseReport(report.id));
  check('Выпуск отчёта невозможен без утверждения человеком',
    releaseBlocked?.includes('REPORT_RELEASE_REQUIRES_APPROVAL'), releaseBlocked ?? '');

  const citingUnknown = await expectRejected(() => app.reports.generateReport(caseId));
  check('Отчёт, сославшийся на несуществующий вывод, отклонён целиком',
    citingUnknown?.includes('REPORT_CITES_UNKNOWN_FINDING'), citingUnknown ?? '');

  const factWithoutEvidence = await expectRejected(() => app.reports.runFinalReview(caseId));
  check('Факт без доказательства не сохраняется даже от Final Reviewer',
    factWithoutEvidence?.includes('FACT_REQUIRES_EVIDENCE'), factWithoutEvidence ?? '');

  // Защитная проверка, признавшая конструкцию несостоятельной, блокирует утверждение
  // вывода: иначе она осталась бы упражнением, ни на что не влияющим.
  const rejecting = await app.reports.runDefenceReview(caseId, ivanov.id);
  const blockedFinding = rejecting.findings[0];
  const approvalBlocked = await expectRejected(
    () => app.reports.approveFinding(blockedFinding.id, 'Всё равно утверждаю'),
  );
  check('Вывод, отвергнутый защитной проверкой, нельзя утвердить',
    approvalBlocked?.includes('FINDING_REJECTED_BY_DEFENCE_REVIEW'), approvalBlocked ?? '');

  // ───────────────────────── Инварианты методологии ─────────────────────────

  const eliminated = await expectRejected(() => app.analysis.runHypothesisReview(caseId));
  check('Попытка агента исключить версию отклонена',
    eliminated?.includes('AGENT_CANNOT_ELIMINATE_HYPOTHESIS'), eliminated ?? '');

  let factRejected = false;
  try {
    assertFindingHasEvidence({ finding_code: 'F-001', finding_type: 'fact', supporting_evidence_ids: [] });
  } catch { factRejected = true; }
  check('FACT без ссылки на доказательство отклонён', factRejected);

  let precisionRejected = false;
  try {
    assertPrecisionNotInflated({ time_precision: 'hour' }, { time_precision: 'exact' });
  } catch { precisionRejected = true; }
  check('Повышение точности времени отклонено', precisionRejected);

  let lastAlternativeProtected = false;
  try {
    assertHypothesisClosureAllowed({
      nextStatus: 'eliminated',
      approval: { status: 'approved', approval_type: 'hypothesis_closure' },
      remainingAlternatives: 0,
    });
  } catch { lastAlternativeProtected = true; }
  check('Последняя альтернативная версия не может быть исключена', lastAlternativeProtected);

  // ───────────────────────── Аудит и воспроизводимость ─────────────────────────

  const auditEvents = await dump(backend, 'AuditEvent');
  const agentRuns = await dump(backend, 'AgentRun');

  check('Изменения записаны в журнал аудита', auditEvents.length > 0, `записей: ${auditEvents.length}`);
  check('Каждый запуск агента сохранён с моделью и версией промпта',
    agentRuns.every((r) => r.model && r.prompt_version && r.agent_version),
    `запусков: ${agentRuns.length}`);
  check('Задействованы все агенты цикла расследования',
    new Set(agentRuns.map((r) => r.agent_type)).size >= 13,
    [...new Set(agentRuns.map((r) => r.agent_type))].join(', '));
  check('Отклонённый по методологии запуск сохранён в журнале',
    agentRuns.filter((r) => r.agent_type === 'hypothesis_analyst').length === 2);

  snapshot = await app.cases.getSnapshot(caseId);
  check('Ни один участник не переведён в subject автоматически',
    snapshot.persons.every((p) => p.participant_type !== 'subject'));
  check('Все альтернативные версии сохранены',
    snapshot.hypotheses.filter((h) => h.status !== 'eliminated').length === plan.hypotheses.length);
  check('Рекомендованные следующие действия сформированы и объяснены',
    (await app.cases.getNextBestActions(caseId)).actions.every((a) => a.reason && a.expected_information_gain));

  if (backend.pool) await backend.pool.end();

  const failed = results.filter((r) => !r.ok);
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено `
    + `(хранилище: ${USE_POSTGRES ? 'PostgreSQL' : 'память'})`);

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Приёмочный прогон прерван:', error);
  process.exitCode = 1;
});
