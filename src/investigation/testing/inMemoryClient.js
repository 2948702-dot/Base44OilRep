/**
 * Клиент Base44 в памяти.
 *
 * Нужен для приёмочного прогона и симулятора: методологию расследования нельзя проверять
 * только на живом приложении, иначе каждая проверка требует деплоя и портит данные.
 * Поведение намеренно ограничено тем, что реально используется репозиториями.
 */

const ENTITY_NAMES = [
  'Organization', 'User', 'InvestigationCase', 'Person', 'Allegation', 'Issue',
  'Hypothesis', 'HypothesisRevision', 'Source', 'Evidence', 'Claim', 'ClaimEvidenceLink',
  'InvestigationEvent', 'Contradiction', 'Interview', 'InterviewQuestion', 'InterviewAnswer',
  'InterviewAccessToken', 'MoneyTransaction', 'MoneyFlowEdge', 'Finding', 'InvestigationTask',
  'ApprovalRequest', 'AgentRun', 'InvestigationJob', 'AuditEvent', 'KnowledgeDocument',
  'TrainingCase',
];

function matches(record, filter) {
  return Object.entries(filter ?? {}).every(([key, value]) => {
    if (value === undefined) return true;
    return record[key] === value;
  });
}

export function createInMemoryClient() {
  const store = new Map(ENTITY_NAMES.map((name) => [name, new Map()]));
  let sequence = 0;

  function collection(name) {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  }

  const entities = {};
  for (const name of ENTITY_NAMES) {
    entities[name] = {
      async get(id) {
        return collection(name).get(id) ?? null;
      },
      async filter(filter, sort, limit) {
        let records = [...collection(name).values()].filter((r) => matches(r, filter));
        if (sort) {
          const desc = sort.startsWith('-');
          const field = desc ? sort.slice(1) : sort;
          records.sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
          if (desc) records.reverse();
        }
        return limit ? records.slice(0, limit) : records;
      },
      async list(sort, limit) {
        return entities[name].filter({}, sort, limit);
      },
      async create(data) {
        sequence += 1;
        const id = `${name.toLowerCase()}_${sequence}`;
        const record = { ...data, id, created_date: new Date().toISOString() };
        collection(name).set(id, record);
        return record;
      },
      async update(id, data) {
        const current = collection(name).get(id);
        if (!current) throw new Error(`${name}/${id} не найден`);
        const updated = { ...current, ...data, id, updated_date: new Date().toISOString() };
        collection(name).set(id, updated);
        return updated;
      },
      async delete(id) {
        collection(name).delete(id);
        return { id };
      },
    };
  }

  return {
    entities,
    integrations: {
      Core: {
        async UploadFile({ file }) {
          sequence += 1;
          return { file_url: `memory://file_${sequence}_${file?.name ?? 'blob'}` };
        },
      },
    },
    functions: {
      async invoke() {
        throw new Error('Вызов serverless-функции недоступен в клиенте в памяти');
      },
    },
    /** Прямой доступ к содержимому для проверок. */
    _dump(name) {
      return [...collection(name).values()];
    },
  };
}
