/**
 * Генерирует схемы Base44 для платформы расследований из канонических определений.
 *
 * Запуск: node investigation/tools/generate-entities.mjs
 *
 * Причина существования генератора: RLS всех 28 сущностей строятся по одному правилу
 * tenant-изоляции. Ручное копирование блоков RLS расходится незаметно и создаёт дыру
 * в изоляции данных другого клиента. Генератор делает расхождение невозможным.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTITIES } from './entity-definitions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'entities');

/**
 * Условие, которое не выполняется никогда.
 * Используется для операций, закрытых для всех ролей без исключения
 * (журнал аудита, запуски агентов, история статусов гипотез).
 */
const NEVER = { 'data.organization_id': '__immutable__' };

const SOFT_DELETE_FIELDS = [
  'deleted_at@dt',
  'deleted_by',
  'deletion_reason',
];

function parseField(spec) {
  let name = spec;
  let schema = { type: 'string' };

  if (name.endsWith('[{}]')) {
    name = name.slice(0, -4);
    schema = { type: 'array', items: { type: 'object' } };
  } else if (name.endsWith('[]')) {
    name = name.slice(0, -2);
    schema = { type: 'array', items: { type: 'string' } };
  } else if (name.endsWith('{}')) {
    name = name.slice(0, -2);
    schema = { type: 'object' };
  } else if (name.endsWith('#')) {
    name = name.slice(0, -1);
    schema = { type: 'number' };
  } else if (name.endsWith('?')) {
    name = name.slice(0, -1);
    schema = { type: 'boolean' };
  } else if (name.endsWith('@date')) {
    name = name.slice(0, -5);
    schema = { type: 'string', format: 'date' };
  } else if (name.endsWith('@dt')) {
    name = name.slice(0, -3);
    schema = { type: 'string', format: 'date-time' };
  } else if (name.includes(':')) {
    const [fieldName, values] = name.split(':');
    name = fieldName;
    schema = { type: 'string', enum: values.split(',') };
  }

  return { name, schema: { ...schema, title: titleFor(name) } };
}

function titleFor(name) {
  return name
    .replace(/_ids$/, ' ids')
    .replace(/_id$/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

/**
 * Строит одно правило RLS: system_admin без ограничений, остальные роли — только внутри
 * своей организации. Пустой список ролей означает операцию, закрытую для всех.
 */
function buildRule(roles, tenantField, allowSystemAdmin = true) {
  const clauses = [];

  if (allowSystemAdmin) {
    clauses.push({ user_condition: { role: 'system_admin' } });
  }

  for (const role of roles) {
    clauses.push({
      $and: [
        { user_condition: { role } },
        { [`data.${tenantField}`]: '{{user.organization_id}}' },
      ],
    });
  }

  if (clauses.length === 0) return NEVER;
  if (clauses.length === 1) return clauses[0];
  return { $or: clauses };
}

const DEFAULT_READ = ['org_owner', 'investigation_manager', 'investigator', 'reviewer', 'read_only'];
const DEFAULT_WRITE = ['org_owner', 'investigation_manager', 'investigator'];
const DEFAULT_DELETE = ['org_owner', 'investigation_manager'];

function buildEntity(def) {
  const tenantField = def.tenantField ?? 'organization_id';
  const addTenantField = def.addTenantField !== false;
  const caseScoped = def.caseScoped !== false;

  const fields = [];
  if (addTenantField) fields.push('organization_id');
  if (caseScoped) fields.push('case_id');
  fields.push(...def.fields, ...SOFT_DELETE_FIELDS);

  const properties = {};
  for (const spec of fields) {
    const { name, schema } = parseField(spec);
    properties[name] = schema;
  }

  const required = [...def.required];
  if (addTenantField && !required.includes('organization_id')) required.unshift('organization_id');
  if (caseScoped && def.optionalCaseId !== true && !required.includes('case_id')) required.push('case_id');

  // Журнальные сущности запрещено закрывать даже для system_admin.
  const immutable = def.update !== undefined && def.update.length === 0
    && def.delete !== undefined && def.delete.length === 0;

  return {
    name: def.name,
    type: 'object',
    description: def.title,
    properties,
    required,
    rls: {
      create: buildRule(def.create ?? DEFAULT_WRITE, tenantField),
      read: buildRule(def.read ?? DEFAULT_READ, tenantField),
      update: buildRule(def.update ?? DEFAULT_WRITE, tenantField, !immutable),
      delete: buildRule(def.delete ?? DEFAULT_DELETE, tenantField, !immutable),
    },
  };
}

mkdirSync(OUT_DIR, { recursive: true });

const header = (name) => `// Сгенерировано investigation/tools/generate-entities.mjs.\n`
  + `// Не редактировать вручную: изменения вносятся в entity-definitions.mjs.\n`
  + `// Сущность: ${name}\n`;

let count = 0;
for (const def of ENTITIES) {
  const entity = buildEntity(def);
  const file = join(OUT_DIR, `${def.name}.jsonc`);
  writeFileSync(file, header(def.name) + JSON.stringify(entity, null, 2) + '\n', 'utf-8');
  count += 1;
}

console.log(`generated ${count} entity schemas in investigation/entities`);
