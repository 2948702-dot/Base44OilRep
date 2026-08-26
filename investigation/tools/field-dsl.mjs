/**
 * Разбор компактного DSL полей, общий для всех генераторов.
 *
 *   "name"                — строка
 *   "amount#"             — число
 *   "is_derived?"         — boolean
 *   "tags[]"              — массив строк
 *   "payload{}"           — объект
 *   "versions[{}]"        — массив объектов
 *   "sampling_date@date"  — дата
 *   "started_at@dt"       — отметка времени
 *   "status:a,b,c"        — перечисление
 */

/**
 * @param {string} spec
 * @returns {{name: string, kind: string, enumValues: string[]|null}}
 */
export function parseFieldSpec(spec) {
  let name = spec;

  if (name.endsWith('[{}]')) return { name: name.slice(0, -4), kind: 'object_array', enumValues: null };
  if (name.endsWith('[]')) return { name: name.slice(0, -2), kind: 'string_array', enumValues: null };
  if (name.endsWith('{}')) return { name: name.slice(0, -2), kind: 'object', enumValues: null };
  if (name.endsWith('#')) return { name: name.slice(0, -1), kind: 'number', enumValues: null };
  if (name.endsWith('?')) return { name: name.slice(0, -1), kind: 'boolean', enumValues: null };
  if (name.endsWith('@date')) return { name: name.slice(0, -5), kind: 'date', enumValues: null };
  if (name.endsWith('@dt')) return { name: name.slice(0, -3), kind: 'timestamp', enumValues: null };

  if (name.includes(':')) {
    const [fieldName, values] = name.split(':');
    return { name: fieldName, kind: 'enum', enumValues: values.split(',') };
  }

  return { name, kind: 'string', enumValues: null };
}

/**
 * Человекочитаемый заголовок поля.
 * @param {string} name
 * @returns {string}
 */
export function titleFor(name) {
  return name
    .replace(/_ids$/, ' ids')
    .replace(/_id$/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

/** snake_case имя таблицы из имени сущности. */
export function tableName(entityName) {
  return entityName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
