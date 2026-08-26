/**
 * Учебное дело симулятора (§51 ТЗ).
 *
 * Учебное дело состоит из двух половин, и граница между ними — главное в этом файле.
 *
 *   Открытая половина — то, что расследование может узнать: первичное сообщение,
 *   список участников, набор материалов, которые можно запросить.
 *
 *   Скрытая половина (`ground_truth`) — что произошло на самом деле, кто говорит правду,
 *   какие факты и противоречия обязаны быть найдены. Её не видит ни один агент
 *   расследования; её читает только Case Director и оценщик бенчмарка.
 *
 * Смешение половин обесценивает измерение целиком, поэтому оно проверяется кодом:
 * `publicView` физически не содержит `ground_truth`, а не «не должен его показывать».
 */

const REQUIRED_TOP = ['slug', 'title', 'type', 'initial_information', 'ground_truth'];
const REQUIRED_TRUTH = ['what_happened', 'key_facts'];

export const TRAINING_CASE_TYPES = [
  'real_public', 'synthetic', 'fiction_adapted', 'internal_anonymized',
];

/**
 * Проверяет учебное дело перед загрузкой в библиотеку.
 *
 * Проверка строгая намеренно: учебное дело с пустыми маркерами даст завышенные метрики,
 * а завышенный бенчмарк хуже отсутствующего — он создаёт уверенность без основания.
 *
 * @param {Object} document
 * @returns {Object} то же дело
 */
export function validateTrainingCase(document) {
  const problems = [];
  const push = (message) => problems.push(message);

  for (const key of REQUIRED_TOP) {
    if (document?.[key] === undefined || document?.[key] === null) push(`нет поля ${key}`);
  }
  if (document?.type && !TRAINING_CASE_TYPES.includes(document.type)) {
    push(`недопустимый тип учебного дела: ${document.type}`);
  }

  const truth = document?.ground_truth ?? {};
  for (const key of REQUIRED_TRUTH) {
    if (truth[key] === undefined) push(`нет ground_truth.${key}`);
  }

  const keyFacts = truth.key_facts ?? [];
  if (!Array.isArray(keyFacts) || keyFacts.length === 0) push('ground_truth.key_facts пуст');
  keyFacts.forEach((fact, index) => {
    if (!fact.id) push(`key_facts[${index}] без id`);
    if (!fact.statement) push(`key_facts[${index}] без формулировки`);
    if (!Array.isArray(fact.markers) || fact.markers.length === 0) {
      push(`key_facts[${index}] (${fact.id ?? '?'}) без маркеров: факт нельзя было бы засчитать найденным`);
    }
  });

  (truth.key_contradictions ?? []).forEach((item, index) => {
    if (!Array.isArray(item.markers) || item.markers.length === 0) {
      push(`key_contradictions[${index}] без маркеров`);
    }
  });

  const responsible = truth.responsible_persons ?? [];
  const innocent = truth.innocent_persons ?? [];
  const overlap = responsible.filter((name) => innocent.includes(name));
  if (overlap.length > 0) push(`человек одновременно причастен и непричастен: ${overlap.join(', ')}`);
  if (responsible.length === 0 && innocent.length === 0) {
    push('ground_truth не различает причастных и непричастных: метрику ложного обвинения нельзя посчитать');
  }

  (document?.evidence_sequence ?? []).forEach((item, index) => {
    if (!item.id) push(`evidence_sequence[${index}] без id`);
    if (!Array.isArray(item.request_markers) || item.request_markers.length === 0) {
      push(`evidence_sequence[${index}] (${item.id ?? '?'}) нельзя запросить: нет request_markers`);
    }
    if (item.available !== false && !item.content) {
      push(`evidence_sequence[${index}] (${item.id ?? '?'}) доступен, но пуст`);
    }
    if (item.available === false && !item.unavailable_reason) {
      push(`evidence_sequence[${index}] (${item.id ?? '?'}) недоступен без объяснения причины`);
    }
  });

  const scripts = truth.person_scripts ?? {};
  for (const [name, script] of Object.entries(scripts)) {
    const known = (document?.persons ?? []).some((person) => person.name === name);
    if (!known && !(truth.hidden_persons ?? []).includes(name)) {
      push(`сценарий задан для «${name}», которого нет ни среди участников, ни среди скрытых лиц`);
    }
    if (!script.default_answer) push(`сценарий «${name}» без ответа по умолчанию`);
  }

  if (problems.length > 0) {
    throw new Error(`Учебное дело ${document?.slug ?? '?'} непригодно:\n- ${problems.join('\n- ')}`);
  }
  return document;
}

/**
 * Открытая половина учебного дела: то, что вправе увидеть человек и агенты расследования.
 * `ground_truth` и сценарии участников сюда не попадают по построению.
 *
 * @param {Object} document
 */
export function publicView(document) {
  const { ground_truth: _hidden, ...rest } = document;
  return {
    ...rest,
    evidence_sequence: (document.evidence_sequence ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
    })),
  };
}

/**
 * Приводит документ к полям сущности TrainingCase.
 *
 * @param {Object} document
 */
export function toEntity(document) {
  return {
    title: document.title,
    type: document.type,
    scenario: document.scenario ?? null,
    ground_truth: document.ground_truth,
    initial_information: document.initial_information,
    evidence_sequence: document.evidence_sequence ?? [],
    persons: document.persons ?? [],
    events: document.events ?? [],
    claims: document.claims ?? [],
    correct_hypotheses: document.correct_hypotheses ?? [],
    misleading_hypotheses: document.misleading_hypotheses ?? [],
    expected_investigative_actions: document.expected_investigative_actions ?? [],
    published: document.published ?? false,
  };
}
