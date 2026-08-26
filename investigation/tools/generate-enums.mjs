/**
 * Генерирует src/investigation/domain/enums.generated.js из тех же определений,
 * из которых собирается схема базы.
 *
 * Запуск: node investigation/tools/generate-enums.mjs
 *
 * Причина: enum расследования используются одновременно в схеме базы, в валидации
 * выходов агентов и в UI. Ручная синхронизация трёх копий расходится; расхождение
 * значения статуса гипотезы или уровня уверенности — это дефект методологии, а не опечатка.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTITIES } from './entity-definitions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, '..', '..', 'src', 'investigation', 'domain', 'enums.generated.js');

const result = {};

for (const def of ENTITIES) {
  const entityEnums = {};
  for (const spec of def.fields) {
    if (spec.includes(':') && !spec.endsWith('[]') && !spec.endsWith('{}')) {
      const [name, values] = spec.split(':');
      entityEnums[name] = values.split(',');
    }
  }
  if (Object.keys(entityEnums).length > 0) {
    result[def.name] = entityEnums;
  }
}

const body = `/* eslint-disable */
// Сгенерировано investigation/tools/generate-enums.mjs.
// Не редактировать вручную: источник — investigation/tools/entity-definitions.mjs.

/**
 * Перечисления сущностей расследования, идентичные ограничениям схемы базы.
 * @type {Record<string, Record<string, string[]>>}
 */
export const ENUMS = ${JSON.stringify(result, null, 2)};

/**
 * Возвращает допустимые значения поля или бросает ошибку, если поле не перечисление.
 * @param {string} entity
 * @param {string} field
 * @returns {string[]}
 */
export function enumValues(entity, field) {
  const values = ENUMS[entity]?.[field];
  if (!values) {
    throw new Error(\`Поле \${entity}.\${field} не является перечислением\`);
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
`;

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, body, 'utf-8');
console.log(`generated enums for ${Object.keys(result).length} entities`);
