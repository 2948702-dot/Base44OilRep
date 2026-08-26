/**
 * Приёмочный прогон платформы расследований (§81 ТЗ).
 *
 * Запуск: node investigation/tools/acceptance.mjs
 *
 * Прогон идёт на клиенте в памяти и на stub-модели с заранее заданными ответами.
 * Проверяется не качество формулировок модели, а то, что система структурно не позволяет
 * нарушить методологию: превратить приблизительное время в точное, назначить виновного
 * после intake, закрыть последнюю альтернативу, выпустить факт без доказательства.
 */

import { createInMemoryClient } from '../../src/investigation/testing/inMemoryClient.js';
import { createInvestigationServices } from '../../src/investigation/services/index.js';
import { createStubLlmClient } from '../../src/investigation/agents/framework/llmClient.js';
import { MISSING_CASH_001 } from '../../src/investigation/fixtures/missingCash001.js';
import { evaluateTransition } from '../../src/investigation/engine/stages.js';
import {
  assertFindingHasEvidence,
  assertHypothesisClosureAllowed,
  assertPrecisionNotInflated,
} from '../../src/investigation/engine/invariants.js';

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
}

const INTAKE_OUTPUT = {
  persons: MISSING_CASH_001.persons.map((p) => ({
    name: p.name,
    role: p.job_title,
    job_title: p.job_title,
    organization: null,
    participant_type: p.participant_type,
    relationship_to_incident: p.relationship_to_incident,
    mentioned_as: p.name,
  })),
  organizations: [{ name: 'База отдыха «Северная»', role: 'место инцидента' }],
  allegations: [
    { description: '24 августа отсутствует 74 000 рублей, полученных от клиента', amount: 74000, currency: 'RUB', stated_by: 'Козлова Ирина' },
    { description: 'Иванов утверждает, что передал наличные Петровой', amount: 74000, currency: 'RUB', stated_by: 'Иванов Сергей' },
  ],
  dates: [{ text: '24 августа', normalized_start: '2026-08-24T00:00:00Z', normalized_end: '2026-08-25T00:00:00Z', precision: 'day' }],
  amounts: [{ text: '74 000 рублей', amount: 74000, currency: 'RUB', precision: 'exact' }],
  locations: ['База отдыха «Северная»'],
  known_sources: MISSING_CASH_001.known_sources.map((s) => ({
    description: s.description, type: s.type, availability: 'claimed',
  })),
  unknowns: ['Кто имел доступ к наличным после 19:00', 'Полный график смен 24 августа'],
  observations: [],
};

const PLAN_OUTPUT = {
  issues: [
    { question: 'Были ли 74 000 рублей фактически переданы администратору?', description: 'Ключевой спорный эпизод', priority: 'critical', related_allegations: ['A-001'] },
    { question: 'Кто имел доступ к наличным на базе 24 августа после 19:00?', description: 'Круг лиц не установлен', priority: 'high', related_allegations: ['A-001'] },
    { question: 'Корректна ли исходная сумма задолженности?', description: 'Сверка CRM и кассы', priority: 'medium', related_allegations: ['A-001'] },
  ],
  hypotheses: [
    {
      description: 'Деньги присвоил капитан',
      type: 'primary',
      evidence_that_would_support: ['Запись камеры без факта передачи', 'Отсутствие Иванова на базе в заявленное время'],
      evidence_that_would_contradict: ['Запись камеры с фактом передачи', 'Показания третьего лица о передаче'],
      addresses_issues: ['I-001'],
    },
    {
      description: 'Капитан передал деньги администратору, после чего средства пропали',
      type: 'alternative',
      evidence_that_would_support: ['Запись камеры с фактом передачи', 'Переписка с подтверждением'],
      evidence_that_would_contradict: ['Отсутствие Иванова на базе', 'Кассовая книга без записи прихода и без доступа третьих лиц'],
      addresses_issues: ['I-001', 'I-002'],
    },
    {
      description: 'Деньги были оприходованы под другой операцией',
      type: 'accounting_error',
      evidence_that_would_support: ['Запись в кассовой книге на другую сумму или дату'],
      evidence_that_would_contradict: ['Полная сверка кассы без расхождений'],
      addresses_issues: ['I-003'],
    },
    {
      description: 'Исходная сумма задолженности рассчитана неверно',
      type: 'technical_error',
      evidence_that_would_support: ['Ошибка в записи CRM', 'Двойное списание'],
      evidence_that_would_contradict: ['Подтверждение суммы клиентом и чеком'],
      addresses_issues: ['I-003'],
    },
  ],
  objectives: ['Установить, была ли передача наличных', 'Установить круг лиц с доступом к наличным'],
  evidence_requests: [
    { description: 'Запись камеры у входа 18:30–19:15', source_type: 'cctv', holder: 'служба базы', resolves: ['I-001'], expected_information_gain: 'very_high', urgency: 'high' },
    { description: 'График смен 24 августа', source_type: 'document', holder: 'управляющая', resolves: ['I-002'], expected_information_gain: 'high', urgency: 'high' },
  ],
  interview_order: [
    { person: 'Смирнов Андрей', round: 1, reason: 'Наименее вовлечён, подтверждает факт оплаты' },
    { person: 'Иванов Сергей', round: 1, reason: 'Прямой участник спорного эпизода' },
    { person: 'Петрова Елена', round: 1, reason: 'Прямой участник спорного эпизода' },
  ],
  investigative_tasks: [
    { title: 'Сверить кассовую книгу и CRM', task_type: 'request_document', reason: 'Проверяет версию учётной ошибки', priority: 'high' },
  ],
  observations: [],
};

const CLAIM_OUTPUT = {
  claims: [
    {
      text: 'Около семи я приехал на базу',
      normalized_statement: 'Иванов прибыл на базу',
      claim_type: 'action',
      subject_entity: 'Иванов Сергей',
      predicate: 'прибыл',
      object_entity: 'база',
      time_start: '2026-08-24T18:30:00Z',
      time_end: '2026-08-24T19:30:00Z',
      time_precision: 'hour',
      amount: null,
      currency: null,
      location: 'База отдыха «Северная»',
      speaker_certainty: 'approximate',
      ai_extraction_confidence: 'moderate',
      source_locator: { char_start: 0, char_end: 27 },
    },
    {
      text: 'передал Лене примерно 74 тысячи',
      normalized_statement: 'Иванов утверждает, что передал деньги Елене Петровой',
      claim_type: 'action',
      subject_entity: 'Иванов Сергей',
      predicate: 'передал деньги',
      object_entity: 'Петрова Елена',
      time_start: '2026-08-24T18:30:00Z',
      time_end: '2026-08-24T19:30:00Z',
      time_precision: 'hour',
      amount: 74000,
      currency: 'RUB',
      location: 'База отдыха «Северная»',
      speaker_certainty: 'approximate',
      ai_extraction_confidence: 'moderate',
      source_locator: { char_start: 28, char_end: 59 },
    },
  ],
  unresolved_references: ['«Лена» сопоставлена с Петровой Еленой по контексту, требуется подтверждение'],
  observations: [],
};

const RED_TEAM_OUTPUT = {
  primary_hypothesis_reviewed: 'H-001',
  alternative_explanations: [
    {
      description: 'Деньги были переданы и оставлены в помещении, доступ к ним имел человек, не включённый в список участников',
      plausibility: 'moderate',
      would_be_supported_by: ['График смен 24 августа', 'Запись камеры служебного входа'],
      currently_ruled_out_by: [],
    },
  ],
  reasoning_flaws: [
    {
      flaw_type: 'missing_witness',
      description: 'Круг лиц с доступом к наличным после 19:00 не установлен; опрошены только двое',
      affected_claims: ['C-002'],
      what_would_settle_it: 'Запросить график смен и список лиц на территории 24 августа',
    },
    {
      flaw_type: 'overlooked_evidence',
      description: 'Пропуск записи камеры 18:40–19:20 не объяснён и не запрошен у службы базы',
      affected_claims: ['C-001'],
      what_would_settle_it: 'Запросить исходный архив камеры и журнал сбоев',
    },
  ],
  overlooked_evidence: ['Журнал сбоев видеонаблюдения'],
  verdict: 'primary_hypothesis_weakened',
  verdict_reason: 'Основная версия не исключает доступ третьих лиц к наличным после передачи',
  observations: [],
};

async function main() {
  const client = createInMemoryClient();
  const scope = {
    organizationId: 'org_1',
    actorId: 'user_investigator',
    actorType: 'user',
  };

  const llm = createStubLlmClient([
    INTAKE_OUTPUT,
    PLAN_OUTPUT,
    CLAIM_OUTPUT,
    RED_TEAM_OUTPUT,
  ]);

  const services = createInvestigationServices({ client, scope, llm });

  // 1. Создание дела
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
  const caseServices = createInvestigationServices({ client, scope: caseScope, llm });

  check('Дело создано с номером и стадией intake',
    investigationCase.case_number?.startsWith('CASE-') && investigationCase.current_stage === 'intake',
    investigationCase.case_number);

  // 2. Intake
  const intake = await caseServices.cases.runIntake(caseId, { description: MISSING_CASH_001.description });
  check('Intake извлёк участников и заявления',
    intake.persons.length === 4 && intake.allegations.length === 2);
  check('После intake никто не признан виновным: нет participant_type = subject',
    intake.persons.every((p) => p.participant_type !== 'subject'));
  check('Intake сохранил неизвестное как неизвестное', intake.unknowns.length > 0);

  // 3. Планирование
  const plan = await caseServices.cases.runPlanning(caseId);
  check('Создано не менее трёх альтернативных версий', plan.hypotheses.length >= 3,
    `версий: ${plan.hypotheses.length}`);
  check('Версии различаются по типу',
    new Set(plan.hypotheses.map((h) => h.type)).size >= 3);
  check('Каждая версия имеет опровергающее доказательство',
    plan.hypotheses.every((h) => (h.evidence_that_would_contradict ?? []).length > 0));
  check('Запрошены независимые доказательства', plan.tasks.length >= 2);
  check('История статусов гипотез записана',
    client._dump('HypothesisRevision').length === plan.hypotheses.length);

  // 4. Машина стадий
  let snapshot = await caseServices.cases.getSnapshot(caseId);
  check('Переход intake → planning разрешён после intake',
    evaluateTransition('intake', 'planning', snapshot).allowed);
  check('Переход planning → interview_round заблокирован без утверждения человеком',
    evaluateTransition('planning', 'interview_round', snapshot).allowed === false);

  // 5. Интервью: требуется утверждение отправки
  const person = intake.persons.find((p) => p.name === 'Иванов Сергей');
  const interview = await caseServices.interviews.createInterview({
    personId: person.id, channel: 'web', round: 1,
  });

  let tokenBlocked = false;
  try {
    await caseServices.interviews.issueAccessToken(interview.id, { baseUrl: 'https://example.test' });
  } catch {
    tokenBlocked = true;
  }
  check('Ссылка на интервью не выдаётся без утверждения человеком', tokenBlocked);

  const approval = await caseServices.cases.requestInterviewDispatchApproval(caseId, [interview.id]);
  await caseServices.approvals.decide(approval.id, 'approved', 'Состав первого раунда проверен');
  const issued = await caseServices.interviews.issueAccessToken(interview.id, { baseUrl: 'https://example.test' });
  check('Ссылка выдана после утверждения и токен хранится только хэшем',
    Boolean(issued.token) && issued.record.token_hash !== issued.token
      && issued.record.token_hash.length === 64);

  // 6. Первый вопрос обязан быть открытым
  let closedFirstRejected = false;
  try {
    await caseServices.interviews.addQuestions(interview.id, [
      { question: 'Вы брали деньги?', question_type: 'challenge' },
    ]);
  } catch {
    closedFirstRejected = true;
  }
  check('Обвинительный вопрос первым отклонён', closedFirstRejected);

  const questions = await caseServices.interviews.addQuestions(interview.id, [
    {
      question: 'Пожалуйста, своими словами максимально подробно расскажите всё, что вам известно '
        + 'об этой ситуации. Начните с момента, который считаете наиболее ранним связанным событием.',
      question_type: 'open',
      purpose: 'Свободный рассказ до уточнений',
    },
  ]);
  check('Открытый первый вопрос принят', questions[0].question_type === 'open');

  // 7. Ответ и извлечение утверждений
  const answer = await caseServices.interviews.submitAnswer({
    questionId: questions[0].id,
    personId: person.id,
    text: 'Около семи я приехал на базу и передал Лене примерно 74 тысячи.',
  });
  check('Оригинал ответа сохранён как источник', Boolean(answer.original_source_id));

  const extraction = await caseServices.interviews.extractClaims(answer.id);
  check('Ответ разобран на атомарные утверждения', extraction.claims.length >= 2);
  check('Каждое утверждение ссылается на источник и позицию в нём',
    extraction.claims.every((c) => c.source_id && c.source_locator
      && Object.values(c.source_locator).some((v) => v !== null && v !== undefined)));
  check('Приблизительное время не превращено в точное',
    extraction.claims.every((c) => c.time_precision !== 'exact'
      && c.speaker_certainty !== 'certain'));
  check('Неоднозначная ссылка зафиксирована, а не додумана',
    extraction.unresolvedReferences.length > 0);

  // 8. Red Team
  const primary = plan.hypotheses.find((h) => h.type === 'primary');
  const redTeam = await caseServices.cases.runRedTeamReview(caseId, primary.id);
  check('Red Team предложил минимум одну правдоподобную альтернативу',
    redTeam.review.alternative_explanations.length >= 1);
  check('Каждая альтернатива проверяема конкретным доказательством',
    redTeam.review.alternative_explanations.every((a) => a.would_be_supported_by.length > 0));
  check('Red Team породил задачи расследования', redTeam.tasks.length >= 1);

  // 9. Следующие действия
  const next = await caseServices.cases.getNextBestActions(caseId);
  check('Сформированы рекомендованные следующие действия', next.actions.length > 0,
    next.actions[0]?.action ?? '');
  check('Каждое действие объяснено причиной и приростом информации',
    next.actions.every((a) => a.reason && a.expected_information_gain));

  // 10. Инварианты методологии
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

  // 11. Аудит и воспроизводимость
  const auditEvents = client._dump('AuditEvent');
  const agentRuns = client._dump('AgentRun');
  check('Изменения записаны в журнал аудита', auditEvents.length > 0, `записей: ${auditEvents.length}`);
  check('Каждый запуск агента сохранён с моделью и версией промпта',
    agentRuns.length === 4 && agentRuns.every((r) => r.model && r.prompt_version && r.agent_version));
  check('Все запуски агентов прошли валидацию схемы',
    agentRuns.every((r) => r.status === 'completed'));

  snapshot = await caseServices.cases.getSnapshot(caseId);
  check('Ни один участник не переведён в subject автоматически',
    snapshot.persons.every((p) => p.participant_type !== 'subject'));
  check('Все альтернативные версии сохранены',
    snapshot.hypotheses.filter((h) => h.status !== 'eliminated').length === plan.hypotheses.length);

  const failed = results.filter((r) => !r.ok);
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Приёмочный прогон прерван:', error);
  process.exitCode = 1;
});
