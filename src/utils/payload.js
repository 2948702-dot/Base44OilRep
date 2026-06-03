/**
 * Собирает payload для отправки в Base44, оставляя только разрешённые поля.
 * Пустые строки и undefined конвертирует в null. Числовые поля парсит через Number.
 *
 * @param {Object} data — исходные данные из формы
 * @param {Array<string>} allowedFields — список полей, которые можно отправлять
 * @param {Array<string>} numberFields — подмножество allowedFields, которые должны быть числами
 * @returns {Object} очищенный payload
 */
export function buildPayload(data, allowedFields, numberFields = []) {
  const payload = {};
  const numberSet = new Set(numberFields);

  for (const key of allowedFields) {
    const value = data[key];

    if (numberSet.has(key)) {
      if (value === '' || value === null || value === undefined) {
        payload[key] = null;
      } else {
        const num = Number(value);
        payload[key] = Number.isFinite(num) ? num : null;
      }
      continue;
    }

    if (value === '' || value === undefined) {
      payload[key] = null;
    } else {
      payload[key] = value;
    }
  }

  return payload;
}

/**
 * Список системных полей Base44, которые НИКОГДА не должны попадать в payload.
 * Используется для проверки и debug-логирования.
 */
export const FORBIDDEN_PAYLOAD_FIELDS = [
  'id',
  'created_date',
  'updated_date',
  'created_by',
  'updated_by',
];
