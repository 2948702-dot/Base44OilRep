/**
 * Генерирует SQL-схему PostgreSQL из тех же определений, что и остальные артефакты.
 *
 * Запуск: node investigation/tools/generate-sql.mjs
 *
 * Что даёт схема базы по сравнению с прежним хранилищем (см. adr-0002-own-stack.md):
 *
 * 1. Изоляция арендатора обеспечивается row-level security самой СУБД, а не правилом
 *    приложения. Приложение подключается ролью без BYPASSRLS: даже ошибка в коде или
 *    забытый фильтр не покажет данные другой организации.
 * 2. Журнальные таблицы защищены триггерами. Запрет на изменение журнала — гарантия
 *    базы, а не соглашение.
 * 3. Внешние ключи и уникальные ограничения существуют: утверждение не может ссылаться
 *    на несуществующий источник, а код C-001 не может повториться внутри дела.
 * 4. Есть pgvector: семантический поиск по методологии и материалам дела — часть схемы,
 *    а не отложенная мечта.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTITIES } from './entity-definitions.mjs';
import { parseFieldSpec, tableName } from './field-dsl.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'db', 'migrations');

/** Имена таблиц, отличающиеся от механического преобразования. */
const TABLE_OVERRIDES = {
  User: 'app_user',
};

/**
 * Внешние ключи. Задаются явно: вывод по имени поля ошибается там, где важнее всего
 * не ошибиться (claim_a_id, source_person_id, related_event_id).
 */
const REFERENCES = {
  app_user: { organization_id: 'organization' },
  investigation_case: { organization_id: 'organization', case_owner_id: 'app_user' },
  person: { organization_id: 'organization', case_id: 'investigation_case' },
  allegation: { case_id: 'investigation_case', source_id: 'source', reported_by_person_id: 'person' },
  issue: { case_id: 'investigation_case' },
  hypothesis: { case_id: 'investigation_case' },
  hypothesis_revision: { case_id: 'investigation_case', hypothesis_id: 'hypothesis', agent_run_id: 'agent_run' },
  source: { case_id: 'investigation_case', source_person_id: 'person', derived_from_source_id: 'source' },
  evidence: { case_id: 'investigation_case', source_id: 'source' },
  claim: {
    case_id: 'investigation_case',
    source_id: 'source',
    source_person_id: 'person',
    interview_id: 'interview',
    answer_id: 'interview_answer',
    agent_run_id: 'agent_run',
  },
  claim_evidence_link: {
    case_id: 'investigation_case',
    claim_id: 'claim',
    evidence_id: 'evidence',
    agent_run_id: 'agent_run',
  },
  investigation_event: { case_id: 'investigation_case', agent_run_id: 'agent_run' },
  contradiction: {
    case_id: 'investigation_case',
    claim_a_id: 'claim',
    claim_b_id: 'claim',
    issue_id: 'issue',
    agent_run_id: 'agent_run',
  },
  interview: { case_id: 'investigation_case', person_id: 'person', dispatch_approval_id: 'approval_request' },
  interview_question: {
    case_id: 'investigation_case',
    interview_id: 'interview',
    issue_id: 'issue',
    approval_id: 'approval_request',
    agent_run_id: 'agent_run',
  },
  interview_answer: {
    case_id: 'investigation_case',
    question_id: 'interview_question',
    interview_id: 'interview',
    person_id: 'person',
    original_source_id: 'source',
    audio_source_id: 'source',
  },
  interview_access_token: { case_id: 'investigation_case', interview_id: 'interview', person_id: 'person' },
  money_transaction: { case_id: 'investigation_case', source_id: 'source', related_event_id: 'investigation_event' },
  money_flow_edge: { case_id: 'investigation_case', transaction_id: 'money_transaction' },
  finding: { case_id: 'investigation_case', approval_id: 'approval_request', agent_run_id: 'agent_run' },
  investigation_task: {
    case_id: 'investigation_case',
    issue_id: 'issue',
    hypothesis_id: 'hypothesis',
    contradiction_id: 'contradiction',
    person_id: 'person',
    evidence_id: 'evidence',
    agent_run_id: 'agent_run',
  },
  approval_request: { case_id: 'investigation_case' },
  agent_run: { case_id: 'investigation_case', job_id: 'investigation_job' },
  investigation_job: { case_id: 'investigation_case', agent_run_id: 'agent_run' },
  audit_event: { case_id: 'investigation_case' },
  knowledge_document: { case_id: 'investigation_case', source_id: 'source' },
  training_case: {},
  organization: {},
};

/** Уникальность человекочитаемых кодов внутри дела. */
const UNIQUE_CONSTRAINTS = {
  organization: [['slug']],
  investigation_case: [['organization_id', 'case_number']],
  allegation: [['case_id', 'code']],
  issue: [['case_id', 'code']],
  hypothesis: [['case_id', 'code']],
  claim: [['case_id', 'claim_code']],
  evidence: [['case_id', 'evidence_code']],
  investigation_event: [['case_id', 'event_code']],
  contradiction: [['case_id', 'contradiction_code']],
  finding: [['case_id', 'finding_code']],
  money_transaction: [['case_id', 'transaction_code']],
  interview_question: [['interview_id', 'sequence']],
  interview_access_token: [['token_hash']],
  hypothesis_revision: [['hypothesis_id', 'revision']],
};

/** Таблицы, содержимое которых нельзя изменить или удалить после записи. */
const APPEND_ONLY = ['audit_event', 'agent_run', 'hypothesis_revision'];

/** Таблицы, которые не ограничиваются организацией на уровне RLS. */
const TENANT_COLUMN_OVERRIDES = {
  organization: 'id',
};

const SQL_TYPES = {
  string: 'text',
  number: 'numeric',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamptz',
  enum: 'text',
  string_array: 'text[]',
  object: 'jsonb',
  object_array: 'jsonb',
};

const SOFT_DELETE_FIELDS = ['deleted_at@dt', 'deleted_by', 'deletion_reason'];

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildTable(def) {
  const table = TABLE_OVERRIDES[def.name] ?? tableName(def.name);
  const addTenantField = def.addTenantField !== false;
  const caseScoped = def.caseScoped !== false;

  const specs = [];
  if (addTenantField) specs.push('organization_id');
  if (caseScoped) specs.push('case_id');
  specs.push(...def.fields, ...SOFT_DELETE_FIELDS);

  const columns = [];
  const checks = [];
  const requiredSet = new Set(def.required);
  if (addTenantField) requiredSet.add('organization_id');
  if (caseScoped && def.optionalCaseId !== true) requiredSet.add('case_id');

  for (const spec of specs) {
    const field = parseFieldSpec(spec);
    const sqlType = field.name === 'organization_id' || field.name === 'case_id'
      || REFERENCES[table]?.[field.name]
      ? 'uuid'
      : SQL_TYPES[field.kind];

    const notNull = requiredSet.has(field.name) ? ' not null' : '';
    columns.push(`  ${field.name} ${sqlType}${notNull}`);

    if (field.kind === 'enum') {
      const values = field.enumValues.map(quoteLiteral).join(', ');
      checks.push(
        `  constraint ${table}_${field.name}_check check (${field.name} is null or ${field.name} in (${values}))`,
      );
    }
  }

  const lines = [
    `create table ${table} (`,
    '  id uuid primary key default gen_random_uuid(),',
    ...columns.map((c) => `${c},`),
    '  created_at timestamptz not null default now(),',
    '  updated_at timestamptz not null default now()',
  ];

  if (checks.length > 0) {
    lines[lines.length - 1] += ',';
    lines.push(checks.join(',\n'));
  }

  lines.push(');');
  return { table, sql: lines.join('\n'), addTenantField, caseScoped };
}

function buildConstraints(table) {
  const statements = [];

  for (const [column, target] of Object.entries(REFERENCES[table] ?? {})) {
    // Удаление данных арендатора — единственный сценарий физического удаления,
    // поэтому каскад идёт только от организации и от дела.
    const onDelete = target === 'organization' || (target === 'investigation_case' && column === 'case_id')
      ? ' on delete cascade'
      : ' on delete set null';
    statements.push(
      `alter table ${table} add constraint ${table}_${column}_fkey `
      + `foreign key (${column}) references ${target}(id)${onDelete};`,
    );
  }

  for (const columnsList of UNIQUE_CONSTRAINTS[table] ?? []) {
    statements.push(
      `alter table ${table} add constraint ${table}_${columnsList.join('_')}_key `
      + `unique (${columnsList.join(', ')});`,
    );
  }

  return statements;
}

function buildIndexes(table, addTenantField, caseScoped) {
  const statements = [];
  if (addTenantField && caseScoped) {
    statements.push(`create index ${table}_org_case_idx on ${table} (organization_id, case_id) where deleted_at is null;`);
  } else if (addTenantField) {
    statements.push(`create index ${table}_org_idx on ${table} (organization_id) where deleted_at is null;`);
  }
  return statements;
}

/**
 * Политики RLS. Приложение выставляет app.organization_id на каждое соединение;
 * системный администратор платформы получает доступ отдельным флагом и только он.
 */
function buildRls(table) {
  const tenantColumn = TENANT_COLUMN_OVERRIDES[table] ?? 'organization_id';
  const predicate = `(
      coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
      or ${tenantColumn} = nullif(current_setting('app.organization_id', true), '')::uuid
    )`;

  return [
    `alter table ${table} enable row level security;`,
    `alter table ${table} force row level security;`,
    `create policy ${table}_tenant_isolation on ${table}`,
    `  using ${predicate}`,
    `  with check ${predicate};`,
  ].join('\n');
}

const parts = [];

parts.push(`-- Сгенерировано investigation/tools/generate-sql.mjs.
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
`);

const built = [];
for (const def of ENTITIES) {
  built.push({ def, ...buildTable(def) });
}

parts.push('-- ============================ ТАБЛИЦЫ ============================\n');
for (const item of built) {
  parts.push(`-- ${item.def.title}\n${item.sql}\n`);
}

parts.push('-- Организация несёт человекочитаемый идентификатор для поддомена и экспорта.');
parts.push('alter table organization add column slug text;\n');

parts.push('-- ======================= СВЯЗИ И УНИКАЛЬНОСТЬ =======================\n');
for (const item of built) {
  const statements = buildConstraints(item.table);
  if (statements.length > 0) parts.push(statements.join('\n') + '\n');
}

parts.push('-- ============================ ИНДЕКСЫ ============================\n');
for (const item of built) {
  const statements = buildIndexes(item.table, item.addTenantField, item.caseScoped);
  if (statements.length > 0) parts.push(statements.join('\n'));
}

parts.push(`
-- Векторный поиск по двум непересекающимся пространствам знаний.
alter table knowledge_document add column embedding vector(1536);
create index knowledge_document_space_idx on knowledge_document (organization_id, space, case_id);
create index knowledge_document_embedding_idx on knowledge_document
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Поиск по тексту утверждений и материалов.
create index claim_text_idx on claim using gin (to_tsvector('russian', coalesce(normalized_statement, text, '')));
create index source_text_idx on source using gin (to_tsvector('russian', coalesce(extracted_text, '')));
`);

parts.push('-- =============== ОБНОВЛЕНИЕ updated_at ===============\n');
parts.push(`create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
`);
for (const item of built) {
  parts.push(
    `create trigger ${item.table}_set_updated_at before update on ${item.table}`
    + `\n  for each row execute function set_updated_at();`,
  );
}

parts.push(`
-- =============== НЕИЗМЕНЯЕМЫЕ ЖУРНАЛЫ ===============
--
-- Журнал аудита, запуски агентов и история статусов гипотез пишутся один раз.
-- Это гарантия базы, а не правило приложения: без неё обещание воспроизводимости
-- расследования ничем не обеспечено.

create or replace function forbid_mutation() returns trigger as $$
begin
  raise exception 'Таблица % — журнальная: изменение и удаление записей запрещены', tg_table_name
    using errcode = 'restrict_violation';
end;
$$ language plpgsql;
`);
for (const table of APPEND_ONLY) {
  parts.push(
    `create trigger ${table}_append_only before update or delete on ${table}`
    + `\n  for each row execute function forbid_mutation();`,
  );
}

parts.push('\n-- ============================ RLS ============================\n');
for (const item of built) {
  parts.push(buildRls(item.table) + '\n');
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, '0001_init.sql'), parts.join('\n') + '\n', 'utf-8');

// Карта таблиц и колонок для слоя репозиториев: он обязан знать схему, чтобы отсеивать
// поля, которых в таблице нет, и не собирать заведомо неверный запрос.
const schemaMap = {};
for (const item of built) {
  const specs = [];
  if (item.addTenantField) specs.push('organization_id');
  if (item.caseScoped) specs.push('case_id');
  specs.push(...item.def.fields, ...SOFT_DELETE_FIELDS);
  const fields = specs.map((spec) => parseFieldSpec(spec));
  schemaMap[item.def.name] = {
    table: item.table,
    caseScoped: item.caseScoped,
    columns: fields.map((field) => field.name),
    // Колонки jsonb: драйвер сериализует объект сам, но массив объектов превращает
    // в postgres-массив и получает синтаксическую ошибку JSON. Такие значения слой
    // репозиториев обязан сериализовать явно.
    jsonColumns: fields
      .filter((field) => field.kind === 'object' || field.kind === 'object_array')
      .map((field) => field.name),
  };
}
schemaMap.KnowledgeDocument.columns.push('embedding');
schemaMap.Organization.columns.push('slug');


const SCHEMA_FILE = join(HERE, '..', '..', 'src', 'investigation', 'repositories', 'postgres', 'schema.generated.js');
mkdirSync(dirname(SCHEMA_FILE), { recursive: true });
writeFileSync(SCHEMA_FILE, `/* eslint-disable */
// Сгенерировано investigation/tools/generate-sql.mjs.
// Не редактировать вручную: источник — investigation/tools/entity-definitions.mjs.

/**
 * Соответствие сущностей домена таблицам и колонкам схемы.
 * @type {Record<string, {table: string, caseScoped: boolean, columns: string[], jsonColumns: string[]}>}
 */
export const SCHEMA = ${JSON.stringify(schemaMap, null, 2)};
`, 'utf-8');

console.log(`generated SQL schema for ${built.length} tables and schema map`);
