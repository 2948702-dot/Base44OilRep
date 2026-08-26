/**
 * Заготовленные ответы агентов для приёмочного прогона.
 *
 * Это не «правильные ответы модели», а фиксированные входы, на которых проверяется
 * поведение системы: сохранит ли она конкурирующие версии времени, отклонит ли попытку
 * исключить версию, пометит ли вопрос, раскрывающий чужие показания.
 *
 * Часть заготовок намеренно содержит нарушения методологии — они нужны, чтобы убедиться,
 * что система их не пропускает.
 */

import { MISSING_CASH_001 } from '../../../src/investigation/fixtures/missingCash001.js';

export const INTAKE_OUTPUT = {
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
    {
      description: '24 августа отсутствует 74 000 рублей, полученных от клиента',
      amount: 74000, currency: 'RUB', stated_by: 'Козлова Ирина',
    },
    {
      description: 'Иванов утверждает, что передал наличные Петровой',
      amount: 74000, currency: 'RUB', stated_by: 'Иванов Сергей',
    },
  ],
  dates: [{
    text: '24 августа',
    normalized_start: '2026-08-24T00:00:00Z',
    normalized_end: '2026-08-25T00:00:00Z',
    precision: 'day',
  }],
  amounts: [{ text: '74 000 рублей', amount: 74000, currency: 'RUB', precision: 'exact' }],
  locations: ['База отдыха «Северная»'],
  known_sources: MISSING_CASH_001.known_sources.map((s) => ({
    description: s.description, type: s.type, availability: 'claimed',
  })),
  unknowns: ['Кто имел доступ к наличным после 19:00', 'Полный график смен 24 августа'],
  observations: [],
};

export const PLAN_OUTPUT = {
  issues: [
    {
      question: 'Были ли 74 000 рублей фактически переданы администратору?',
      description: 'Ключевой спорный эпизод', priority: 'critical', related_allegations: ['A-001'],
    },
    {
      question: 'Кто имел доступ к наличным на базе 24 августа после 19:00?',
      description: 'Круг лиц не установлен', priority: 'high', related_allegations: ['A-001'],
    },
    {
      question: 'Корректна ли исходная сумма задолженности?',
      description: 'Сверка CRM и кассы', priority: 'medium', related_allegations: ['A-001'],
    },
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
    {
      description: 'Запись камеры у входа 18:30–19:15', source_type: 'cctv', holder: 'служба базы',
      resolves: ['I-001'], expected_information_gain: 'very_high', urgency: 'high',
    },
    {
      description: 'График смен 24 августа', source_type: 'document', holder: 'управляющая',
      resolves: ['I-002'], expected_information_gain: 'high', urgency: 'high',
    },
  ],
  interview_order: [
    { person: 'Смирнов Андрей', round: 1, reason: 'Наименее вовлечён, подтверждает факт оплаты' },
    { person: 'Иванов Сергей', round: 1, reason: 'Прямой участник спорного эпизода' },
    { person: 'Петрова Елена', round: 1, reason: 'Прямой участник спорного эпизода' },
  ],
  investigative_tasks: [
    {
      title: 'Сверить кассовую книгу и CRM', task_type: 'request_document',
      reason: 'Проверяет версию учётной ошибки', priority: 'high',
    },
  ],
  observations: [],
};

/** План интервью капитана: чужие показания вынесены в «не раскрывать». */
export const STRATEGY_IVANOV = {
  known_to_investigation: [
    'Клиент внёс оплату 74 000 ₽ наличными 24 августа',
    'В CRM заказ отмечен завершённым и оплаченным',
    'Поступления в банк не было',
  ],
  potential_knowledge: [
    'Обстоятельства получения денег от клиента',
    'Что происходило с деньгами после получения',
    'Кто находился на базе вечером 24 августа',
  ],
  unknown: ['Судьба наличных после прибытия на базу', 'Полный круг лиц с доступом к деньгам'],
  information_not_to_reveal_yet: [
    { item: 'Петрова отрицает получение денег', reason: 'Раскрытие позволит подстроить рассказ' },
    { item: 'В записи камеры есть пропуск 18:40–19:20', reason: 'Знание о пробеле влияет на показания о времени' },
  ],
  objectives: ['Установить хронологию обращения с наличными', 'Установить свидетелей передачи'],
  questions: [
    {
      question: 'Пожалуйста, своими словами максимально подробно расскажите всё, что вам известно '
        + 'об этой ситуации. Начните с момента, который считаете наиболее ранним связанным событием.',
      question_type: 'open',
      purpose: 'Свободный рассказ до любых уточнений',
      addresses_issue: 'I-001',
      sensitive: false,
      sensitive_reason: null,
    },
    {
      question: 'Что происходило после того, как вы получили деньги от клиента?',
      question_type: 'chronology',
      purpose: 'Хронология обращения с наличными',
      addresses_issue: 'I-001',
      sensitive: false,
      sensitive_reason: null,
    },
    {
      question: 'Кто ещё находился рядом в этот момент?',
      question_type: 'corroboration',
      purpose: 'Поиск независимых свидетелей',
      addresses_issue: 'I-002',
      sensitive: false,
      sensitive_reason: null,
    },
  ],
  observations: [],
};

export const STRATEGY_PETROVA = {
  known_to_investigation: ['Клиент внёс оплату наличными', 'Поступления в банк не было'],
  potential_knowledge: ['Порядок приёма наличных на базе', 'Кто был на смене вечером 24 августа'],
  unknown: ['Судьба наличных'],
  information_not_to_reveal_yet: [
    { item: 'Иванов утверждает, что передал ей деньги', reason: 'Раскрытие превратит опрос в очную ставку до сбора объективных данных' },
  ],
  objectives: ['Установить порядок приёма наличных', 'Установить круг лиц на смене'],
  questions: [
    {
      question: 'Расскажите, пожалуйста, своими словами, как прошёл ваш рабочий день 24 августа.',
      question_type: 'open',
      purpose: 'Свободный рассказ',
      addresses_issue: 'I-002',
      sensitive: false,
      sensitive_reason: null,
    },
    {
      question: 'Опишите обычный порядок: как на базе принимают и оформляют наличные?',
      question_type: 'probing',
      purpose: 'Установить процедуру и точки контроля',
      addresses_issue: 'I-002',
      sensitive: false,
      sensitive_reason: null,
    },
  ],
  observations: [],
};

export const CLAIMS_IVANOV = {
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
      amount: null, currency: null,
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
      amount: 74000, currency: 'RUB',
      location: 'База отдыха «Северная»',
      speaker_certainty: 'approximate',
      ai_extraction_confidence: 'moderate',
      source_locator: { char_start: 28, char_end: 59 },
    },
  ],
  unresolved_references: ['«Лена» сопоставлена с Петровой Еленой по контексту, требуется подтверждение'],
  observations: [],
};

export const CLAIMS_PETROVA = {
  claims: [
    {
      text: 'Никаких денег в тот день мне никто не передавал',
      normalized_statement: 'Петрова отрицает получение денег 24 августа',
      claim_type: 'denial',
      subject_entity: 'Петрова Елена',
      predicate: 'не получала деньги',
      object_entity: 'наличные 74 000 ₽',
      time_start: '2026-08-24T00:00:00Z',
      time_end: '2026-08-25T00:00:00Z',
      time_precision: 'day',
      amount: null, currency: null,
      location: 'База отдыха «Северная»',
      speaker_certainty: 'certain',
      ai_extraction_confidence: 'high',
      source_locator: { char_start: 0, char_end: 46 },
    },
    {
      text: 'я ушла со смены в половине седьмого',
      normalized_statement: 'Петрова покинула базу около 18:30',
      claim_type: 'action',
      subject_entity: 'Петрова Елена',
      predicate: 'покинула базу',
      object_entity: null,
      time_start: '2026-08-24T18:00:00Z',
      time_end: '2026-08-24T19:00:00Z',
      time_precision: 'hour',
      amount: null, currency: null,
      location: 'База отдыха «Северная»',
      speaker_certainty: 'approximate',
      ai_extraction_confidence: 'moderate',
      source_locator: { char_start: 47, char_end: 82 },
    },
  ],
  unresolved_references: [],
  observations: [],
};

/**
 * Хронология с конкурирующими версиями времени: два источника дают разное время
 * одного события, и система обязана сохранить обе версии.
 */
export const TIMELINE_OUTPUT = {
  events: [
    {
      event_code_hint: 'Прибытие капитана на базу',
      event_type: 'arrival',
      description: 'Иванов прибыл на базу с наличными',
      start_at: '2026-08-24T18:30:00Z',
      end_at: '2026-08-24T19:30:00Z',
      time_precision: 'hour',
      location: 'База отдыха «Северная»',
      participant_names: ['Иванов Сергей'],
      source_claim_codes: ['C-001'],
      confidence: 'moderate',
      competing_versions: [],
    },
    {
      event_code_hint: 'Спорная передача наличных',
      event_type: 'handover',
      description: 'Заявленная передача наличных администратору',
      start_at: '2026-08-24T18:30:00Z',
      end_at: '2026-08-24T19:30:00Z',
      time_precision: 'hour',
      location: 'База отдыха «Северная»',
      participant_names: ['Иванов Сергей', 'Петрова Елена'],
      source_claim_codes: ['C-002'],
      confidence: 'low',
      competing_versions: [
        {
          start_at: '2026-08-24T18:00:00Z',
          end_at: '2026-08-24T19:00:00Z',
          time_precision: 'hour',
          source_claim_codes: ['C-004'],
          note: 'По словам Петровой, она покинула базу около 18:30 и передачи не было',
        },
      ],
    },
  ],
  gaps: [
    {
      from: '2026-08-24T19:30:00Z',
      to: '2026-08-25T09:00:00Z',
      description: 'Ночной период без единого утверждения о местонахождении наличных',
      why_it_matters: 'Именно в этот промежуток деньги могли быть изъяты третьим лицом',
    },
  ],
  impossible_sequences: [],
  observations: [],
};

export const CONTRADICTIONS_OUTPUT = {
  contradictions: [
    {
      claim_a_code: 'C-002',
      claim_b_code: 'C-003',
      type: 'direct',
      severity: 'critical',
      description: 'Иванов утверждает, что передал деньги Петровой; Петрова отрицает получение',
      recommended_checks: [
        'Запись камеры у входа 18:30–19:15',
        'Переписка Иванова и Петровой за 24 августа',
        'Кассовая книга и записи CRM',
        'График смен: кто ещё был на базе',
      ],
    },
    {
      claim_a_code: 'C-001',
      claim_b_code: 'C-004',
      type: 'temporal',
      severity: 'high',
      description: 'Иванов прибыл около 19:00, Петрова заявляет об уходе около 18:30',
      recommended_checks: ['Журнал смен', 'GPS-трек катера', 'Запись камеры'],
    },
  ],
  observations: [],
};

export const HYPOTHESIS_REVIEW_OUTPUT = {
  analyses: [
    {
      hypothesis_code: 'H-001',
      status: 'weakened',
      supporting_claim_ids: [],
      supporting_evidence_ids: [],
      contradicting_claim_ids: ['C-002'],
      contradicting_evidence_ids: [],
      unexplained_evidence: ['Отсутствие независимого подтверждения в обе стороны'],
      missing_evidence: ['Запись камеры 18:30–19:15'],
      alternative_explanations: ['Деньги переданы, но не оприходованы'],
      confidence: 'low',
      status_change_reason: 'Нет ни одного объективного доказательства присвоения; версия держится на отрицании второй стороны',
    },
    {
      hypothesis_code: 'H-002',
      status: 'active',
      supporting_claim_ids: ['C-002'],
      supporting_evidence_ids: [],
      contradicting_claim_ids: ['C-003'],
      contradicting_evidence_ids: [],
      unexplained_evidence: ['Отсутствие записи прихода в кассовой книге'],
      missing_evidence: ['График смен 24 августа', 'Запись камеры'],
      alternative_explanations: ['К наличным имело доступ третье лицо'],
      confidence: 'low',
      status_change_reason: 'Версия проверяема и не опровергнута; требуется график смен',
    },
    {
      hypothesis_code: 'H-003',
      status: 'active',
      supporting_claim_ids: [],
      supporting_evidence_ids: [],
      contradicting_claim_ids: [],
      contradicting_evidence_ids: [],
      unexplained_evidence: [],
      missing_evidence: ['Сверка кассовой книги и CRM'],
      alternative_explanations: [],
      confidence: 'very_low',
      status_change_reason: 'Данных для оценки пока нет',
    },
    {
      hypothesis_code: 'H-004',
      status: 'active',
      supporting_claim_ids: [],
      supporting_evidence_ids: [],
      contradicting_claim_ids: [],
      contradicting_evidence_ids: [],
      unexplained_evidence: [],
      missing_evidence: ['Подтверждение суммы клиентом и чеком'],
      alternative_explanations: [],
      confidence: 'very_low',
      status_change_reason: 'Данных для оценки пока нет',
    },
  ],
  observations: [],
};

/** Заготовка с нарушением: агент пытается исключить версию — система обязана отказать. */
export const HYPOTHESIS_REVIEW_ELIMINATING = {
  analyses: [
    {
      hypothesis_code: 'H-003',
      status: 'eliminated',
      supporting_claim_ids: [],
      supporting_evidence_ids: [],
      contradicting_claim_ids: [],
      contradicting_evidence_ids: [],
      unexplained_evidence: [],
      missing_evidence: [],
      alternative_explanations: [],
      confidence: 'moderate',
      status_change_reason: 'Версия кажется маловероятной',
    },
  ],
  observations: [],
};

export const RED_TEAM_OUTPUT = {
  primary_hypothesis_reviewed: 'H-001',
  alternative_explanations: [
    {
      description: 'Деньги были переданы и оставлены в помещении, доступ к ним имел человек, '
        + 'не включённый в список участников',
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

export const FOLLOW_UP_OUTPUT = {
  priorities: [
    {
      target_person_name: 'Петрова Елена',
      reason_category: 'critical_contradiction',
      questions: [
        {
          question: 'Опишите подробно, как заканчивалась ваша смена 24 августа: во сколько вы ушли, '
            + 'кто оставался на базе, кому передавали дела.',
          question_type: 'chronology',
          purpose: 'Установить границы смены и круг лиц',
          reveals_other_testimony: false,
          sensitive: false,
        },
        {
          question: 'Другой участник описывает передачу вам наличных в этот вечер. Что вы можете '
            + 'сказать об этом эпизоде?',
          question_type: 'challenge',
          purpose: 'Прямая проверка спорного эпизода',
          // Раскрывает чужие показания: система обязана пометить вопрос как чувствительный.
          reveals_other_testimony: true,
          sensitive: false,
        },
      ],
    },
    {
      target_person_name: 'Козлова Ирина',
      reason_category: 'missing_evidence',
      questions: [
        {
          question: 'Кто ещё имел доступ к помещению администратора вечером 24 августа, включая '
            + 'сотрудников без официальной смены?',
          question_type: 'probing',
          purpose: 'Установить круг лиц с доступом к наличным',
          reveals_other_testimony: false,
          sensitive: false,
        },
      ],
    },
  ],
  evidence_requests: [
    {
      description: 'График смен и список лиц на территории 24 августа',
      resolves: 'I-002',
      expected_information_gain: 'very_high',
    },
  ],
  recommend_stop: false,
  stop_reason: null,
  observations: [],
};

export const INTERVIEWER_TURN_OUTPUT = {
  assessment: {
    covered_objectives: ['Установить хронологию обращения с наличными'],
    open_objectives: ['Установить свидетелей передачи'],
    unclear_points: ['Точные границы времени прибытия', 'Присутствие третьих лиц'],
  },
  follow_up_questions: [
    {
      question: 'Вы сказали «около семи». Не раньше какого времени и не позже какого это точно было?',
      question_type: 'clarification',
      purpose: 'Уточнить границы интервала, не навязывая точного времени',
      responds_to_answer_id: null,
      sensitive: false,
    },
    {
      question: 'Есть ли переписка или иные материалы, относящиеся к этому вечеру, которые вы '
        + 'могли бы приложить?',
      question_type: 'corroboration',
      purpose: 'Запрос подтверждающих материалов',
      responds_to_answer_id: null,
      sensitive: false,
    },
  ],
  interview_complete: false,
  completion_reason: 'Остались неуточнённые границы времени и не запрошены подтверждающие материалы',
  observations: [],
};

/**
 * Классификация выводов. Разные типы намеренно перемешаны: проверяется, что система
 * различает установленный факт, подтверждённое утверждение, вывод и неразрешённый вопрос.
 */
export const FINAL_REVIEW_OUTPUT = {
  findings: [
    {
      statement: 'Клиент внёс оплату наличными в размере 74 000 ₽ 24 августа',
      finding_type: 'fact',
      confidence: 'high',
      supporting_claim_codes: ['C-001'],
      supporting_evidence_codes: ['E-001'],
      contradicting_evidence_codes: [],
      alternative_explanations: [],
      issue_codes: ['I-003'],
      hypothesis_codes: [],
      classification_reason: 'Подтверждено объективным материалом, приобщённым к делу',
    },
    {
      statement: 'Иванов заявляет о передаче наличных администратору; Петрова получение отрицает',
      finding_type: 'unresolved',
      confidence: 'very_low',
      supporting_claim_codes: ['C-002', 'C-003'],
      supporting_evidence_codes: [],
      contradicting_evidence_codes: [],
      alternative_explanations: [
        'Передача состоялась, но не была оприходована',
        'К наличным имело доступ третье лицо',
      ],
      issue_codes: ['I-001'],
      hypothesis_codes: ['H-001', 'H-002'],
      classification_reason: 'Два прямо противоречащих показания без независимого подтверждения',
    },
    {
      statement: 'Порядок приёма наличных на базе не обеспечивал фиксацию передачи между сотрудниками',
      finding_type: 'procedural_failure',
      confidence: 'moderate',
      supporting_claim_codes: ['C-004'],
      supporting_evidence_codes: [],
      contradicting_evidence_codes: [],
      alternative_explanations: [],
      issue_codes: ['I-002'],
      hypothesis_codes: [],
      classification_reason: 'Следует из описания процедуры самими сотрудниками',
    },
    {
      statement: 'Круг лиц с доступом к наличным после 19:00 не установлен',
      finding_type: 'unresolved',
      confidence: 'very_low',
      supporting_claim_codes: [],
      supporting_evidence_codes: [],
      contradicting_evidence_codes: [],
      alternative_explanations: [],
      issue_codes: ['I-002'],
      hypothesis_codes: ['H-002'],
      classification_reason: 'График смен не получен',
    },
  ],
  unresolved_questions: [
    {
      question: 'Была ли передача наличных администратору?',
      why_unresolved: 'Показания противоречат друг другу, объективных материалов нет',
      what_would_resolve_it: 'Запись камеры 18:30–19:15 или показания третьего лица',
    },
    {
      question: 'Кто имел доступ к наличным после 19:00?',
      why_unresolved: 'График смен не запрошен',
      what_would_resolve_it: 'График смен и список лиц на территории 24 августа',
    },
  ],
  report_readiness: 'not_ready',
  readiness_reason: 'Критическое противоречие о передаче наличных остаётся неразрешённым',
  observations: [],
};

/** Нарушение: факт объявлен без единого доказательства. */
export const FINAL_REVIEW_FACT_WITHOUT_EVIDENCE = {
  findings: [
    {
      statement: 'Деньги были присвоены капитаном',
      finding_type: 'fact',
      confidence: 'high',
      supporting_claim_codes: ['C-003'],
      supporting_evidence_codes: [],
      contradicting_evidence_codes: [],
      alternative_explanations: [],
      issue_codes: ['I-001'],
      hypothesis_codes: ['H-001'],
      classification_reason: 'Показания администратора выглядят убедительнее',
    },
  ],
  unresolved_questions: [],
  report_readiness: 'ready',
  readiness_reason: 'Основной вопрос считаю установленным',
  observations: [],
};

export const REPORT_OUTPUT = {
  title: 'Отчёт о разбирательстве: недостача наличных 24 августа',
  executive_summary: [
    {
      text: 'Установлено, что клиент внёс 74 000 ₽ наличными. Дальнейшее движение средств '
        + 'объективными материалами не подтверждено: показания участников прямо расходятся, '
        + 'независимых доказательств передачи не получено.',
      finding_codes: ['F-001', 'F-002'],
    },
    {
      text: 'Разбирательство выявило отсутствие фиксации передачи наличных между сотрудниками. '
        + 'Круг лиц с доступом к деньгам вечером 24 августа не установлен.',
      finding_codes: ['F-003', 'F-004'],
    },
  ],
  scope: 'Проверялось движение наличных, полученных от клиента 24 августа. Кадровые и '
    + 'дисциплинарные вопросы за рамками разбирательства.',
  methodology: 'Опрос участников по методике PEACE, извлечение атомарных утверждений с '
    + 'привязкой к источникам, построение хронологии, анализ противоречий, проверка версий, '
    + 'независимая критическая проверка основной версии.',
  incident: 'Клиент оплатил аренду катера наличными в размере 74 000 ₽. Средства не поступили '
    + 'в кассу и на расчётный счёт.',
  persons: [
    { name: 'Иванов Сергей', role: 'капитан', relationship_to_incident: 'принял оплату от клиента' },
    { name: 'Петрова Елена', role: 'администратор', relationship_to_incident: 'предполагаемый получатель наличных' },
  ],
  timeline: [
    {
      when: 'около 19:00, 24 августа',
      what: 'Прибытие капитана на базу',
      confidence: 'moderate',
      event_codes: ['EV-001'],
    },
    {
      when: 'вечер 24 августа, точное время не установлено',
      what: 'Заявленная передача наличных администратору',
      confidence: 'very_low',
      event_codes: ['EV-002'],
    },
  ],
  established_facts: [
    { text: 'Клиент внёс 74 000 ₽ наличными 24 августа.', finding_codes: ['F-001'] },
  ],
  claims: [
    {
      text: 'Передал наличные администратору вечером 24 августа',
      said_by: 'Иванов Сергей',
      corroboration: 'независимого подтверждения не получено',
      claim_codes: ['C-002'],
    },
    {
      text: 'Наличных не получала',
      said_by: 'Петрова Елена',
      corroboration: 'независимого подтверждения не получено',
      claim_codes: ['C-003'],
    },
  ],
  contradictions: [
    {
      text: 'Заявление о передаче наличных и отрицание их получения',
      contradiction_codes: ['CONTR-001'],
      resolution_status: 'открыто',
    },
  ],
  hypothesis_analysis: [
    {
      hypothesis_code: 'H-001',
      description: 'Деньги присвоил капитан',
      status: 'weakened',
      summary: 'Объективных подтверждений не получено; версия держится на отрицании второй стороны',
    },
    {
      hypothesis_code: 'H-002',
      description: 'Деньги переданы, после чего пропали',
      status: 'active',
      summary: 'Не опровергнута; требует графика смен и записи камеры',
    },
  ],
  unresolved_questions: [
    'Была ли передача наличных администратору',
    'Кто имел доступ к наличным после 19:00',
  ],
  recommended_actions: [
    {
      action: 'Ввести обязательную фиксацию передачи наличных между сотрудниками с подписью обеих сторон',
      reason: 'Отсутствие фиксации сделало эпизод непроверяемым',
      priority: 'high',
    },
    {
      action: 'Запросить запись камеры за 18:30–19:15 и журнал сбоев видеонаблюдения',
      reason: 'Может разрешить основное противоречие',
      priority: 'critical',
    },
  ],
  appendices: [],
  observations: [],
};

/** Нарушение: оформитель сослался на вывод, которого нет среди утверждённых. */
export const REPORT_CITING_UNKNOWN_FINDING = {
  ...REPORT_OUTPUT,
  executive_summary: [
    {
      text: 'Установлено, что деньги присвоены капитаном.',
      finding_codes: ['F-099'],
    },
  ],
};

/**
 * Подтверждение утверждений. Намеренно консервативно: показания двух людей,
 * противоречащие друг другу, не дают подтверждения ни одному из них.
 */
export const CORROBORATION_OUTPUT = {
  assessments: [
    {
      claim_code: 'C-001',
      independent_source_count: 1,
      independence_reasoning: 'Только сам Иванов; приобщённое объяснение восходит к нему же',
      objective_evidence_codes: ['E-001'],
      contradicting_evidence_codes: [],
      supporting_claim_codes: [],
      corroboration_status: 'single_source',
      verification_status: 'partially_verified',
      what_would_corroborate_it: ['GPS-трек катера', 'Запись камеры у входа'],
    },
    {
      claim_code: 'C-002',
      independent_source_count: 1,
      independence_reasoning: 'Единственный источник — сам Иванов; Петрова прямо отрицает',
      objective_evidence_codes: [],
      contradicting_evidence_codes: [],
      supporting_claim_codes: [],
      corroboration_status: 'contradicted',
      verification_status: 'unverified',
      what_would_corroborate_it: ['Запись камеры 18:30–19:15', 'Показания третьего лица'],
    },
    {
      claim_code: 'C-003',
      independent_source_count: 1,
      independence_reasoning: 'Единственный источник — сама Петрова',
      objective_evidence_codes: [],
      contradicting_evidence_codes: [],
      supporting_claim_codes: [],
      corroboration_status: 'contradicted',
      verification_status: 'unverified',
      what_would_corroborate_it: ['Кассовая книга', 'График смен'],
    },
    {
      claim_code: 'C-004',
      independent_source_count: 1,
      independence_reasoning: 'Только со слов Петровой',
      objective_evidence_codes: [],
      contradicting_evidence_codes: [],
      supporting_claim_codes: [],
      // Попытка объявить утверждение проверенным без объективного материала:
      // система обязана понизить статус до частичной проверки.
      corroboration_status: 'single_source',
      verification_status: 'verified',
      what_would_corroborate_it: ['График смен 24 августа'],
    },
  ],
  evidence_links: [
    {
      claim_code: 'C-001',
      evidence_code: 'E-001',
      relation: 'partially_supports',
      strength: 'moderate',
      explanation: 'Объяснение капитана подтверждает факт прибытия, но не передачу денег',
    },
  ],
  observations: [],
};

export const DEFENCE_REVIEW_OUTPUT = {
  person_reviewed: 'Иванов Сергей',
  adverse_findings_reviewed: ['F-002'],
  weaknesses: [
    {
      weakness_type: 'no_independent_corroboration',
      description: 'Вывод о спорном эпизоде опирается только на два взаимно противоречащих '
        + 'показания; независимого источника нет ни у одной стороны',
      affected_claim_codes: ['C-002', 'C-003'],
      affected_finding_codes: ['F-002'],
      what_would_close_it: 'Получить запись камеры 18:30–19:15 или показания третьего лица',
      severity: 'critical',
    },
    {
      weakness_type: 'evidence_gap',
      description: 'Между прибытием на базу и обнаружением недостачи нет ни одного '
        + 'подтверждённого звена: цепочка держится на правдоподобии',
      affected_claim_codes: ['C-001'],
      affected_finding_codes: ['F-002'],
      what_would_close_it: 'Кассовая книга и график смен за 24 августа',
      severity: 'high',
    },
  ],
  strongest_counterargument: 'Ни один материал дела не отличает версию «передал и не оприходовали» '
    + 'от версии «не передавал»: обе объясняют все имеющиеся факты одинаково',
  verdict: 'conclusions_require_more_evidence',
  verdict_reason: 'Выводы не опровергнуты, но и не выдерживают проверки без объективных материалов',
  observations: [],
};

/** Защитная проверка признала конструкцию несостоятельной: вывод нельзя утвердить. */
export const DEFENCE_REVIEW_REJECTING = {
  ...DEFENCE_REVIEW_OUTPUT,
  verdict: 'conclusions_should_not_stand',
  verdict_reason: 'Вывод построен на допущении, которое ничем не проверено',
};

export const ROOT_CAUSE_OUTPUT = {
  immediate_cause: 'Наличные, полученные от клиента, не были оприходованы в день получения',
  contributing_factors: [
    {
      factor: 'Передача наличных между сотрудниками нигде не фиксировалась',
      evidence_basis: 'Описание процедуры самими сотрудниками',
    },
    {
      factor: 'Сверка кассы и CRM проводилась не ежедневно',
      evidence_basis: 'Недостача обнаружена только управляющей и не сразу',
    },
  ],
  control_failures: [
    {
      control: 'Оприходование наличных в день получения',
      expected_behaviour: 'Деньги вносятся в кассу и отражаются в учёте в тот же день',
      actual_behaviour: 'Деньги остались вне учёта до обнаружения недостачи',
      why_it_failed: 'Процедура не предусматривала подтверждения приёма и не проверялась',
    },
    {
      control: 'Ежедневная сверка кассы и CRM',
      expected_behaviour: 'Расхождение выявляется в течение суток',
      actual_behaviour: 'Расхождение выявлено позже и не в рамках регулярной сверки',
      why_it_failed: 'Сверка не была регулярной обязанностью с назначенным исполнителем',
    },
  ],
  root_causes: [
    {
      cause: 'Оборот наличных не имел точки обязательной фиксации при передаче между сотрудниками',
      reasoning_chain: [
        'Клиент оплатил наличными вне кассы',
        'Передача от капитана администратору нигде не фиксировалась',
        'Отсутствие записи сделало эпизод непроверяемым в принципе',
        'Ни одна из сторон не может ни подтвердить, ни опровергнуть передачу',
      ],
      confidence: 'moderate',
    },
  ],
  corrective_actions: [
    {
      action: 'Ввести подтверждение приёма наличных подписью обеих сторон с указанием времени',
      addresses: 'Отсутствие фиксации передачи',
      owner_role: 'управляющая базой',
      priority: 'critical',
    },
  ],
  preventive_actions: [
    {
      action: 'Назначить ежедневную сверку кассы и CRM с указанием ответственного и срока',
      prevents: 'Позднее обнаружение расхождений',
      priority: 'high',
    },
  ],
  observations: [],
};
