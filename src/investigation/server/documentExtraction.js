/**
 * Извлечение текста из материалов дела.
 *
 * Задача не в том, чтобы получить текст, а в том, чтобы каждое извлечённое утверждение
 * можно было показать в оригинале: страница PDF, строка таблицы, номер сообщения.
 * Без этой привязки Claim не имеет источника, а Finding — доказательства (§26 ТЗ).
 *
 * Оригинал не изменяется: извлечённый текст становится отдельным производным источником.
 * Всё содержимое считается недоверенными данными: текст «Ignore previous instructions»
 * внутри PDF — это признак возможной манипуляции, а не команда.
 */

const MAX_TEXT_LENGTH = 2_000_000;

/**
 * @typedef {Object} ExtractedDocument
 * @property {string} text
 * @property {'plain'|'csv'|'pdf'|'json'} format
 * @property {Array<{kind: string, ref: string|number, text: string}>} units
 * @property {Record<string, unknown>} metadata
 */

function truncate(text) {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  // Обрезка отмечается явно: молча укороченный документ выглядит как полный,
  // и утверждения из отброшенной части просто не появятся.
  return `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[МАТЕРИАЛ ОБРЕЗАН ПРИ ИЗВЛЕЧЕНИИ]`;
}

function extractPlain(buffer) {
  const text = truncate(new TextDecoder('utf-8').decode(buffer));
  const units = text.split(/\r?\n/).map((line, index) => ({
    kind: 'line',
    ref: index + 1,
    text: line,
  })).filter((unit) => unit.text.trim().length > 0);
  return { text, format: 'plain', units, metadata: { lines: units.length } };
}

/**
 * Разбор таблицы. Строка — единица привязки: утверждение из таблицы должно
 * указывать на конкретную строку, а не на файл целиком.
 */
function extractCsv(buffer) {
  const raw = truncate(new TextDecoder('utf-8').decode(buffer));
  const separator = (raw.split('\n')[0] ?? '').includes(';') ? ';' : ',';
  const rows = raw.split(/\r?\n/).filter((row) => row.trim().length > 0);
  const header = rows[0]?.split(separator).map((cell) => cell.trim()) ?? [];

  const units = rows.slice(1).map((row, index) => {
    const cells = row.split(separator).map((cell) => cell.trim());
    const labelled = header.length > 0
      ? header.map((name, i) => `${name}: ${cells[i] ?? ''}`).join('; ')
      : row;
    return { kind: 'row', ref: index + 2, text: labelled };
  });

  return {
    text: [rows[0] ?? '', ...units.map((u) => u.text)].join('\n'),
    format: 'csv',
    units,
    metadata: { separator, columns: header, rows: units.length },
  };
}

/**
 * Разбор PDF. Единица привязки — страница: следователь должен уметь открыть
 * оригинал на нужной странице и увидеть тот же текст.
 */
async function extractPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Внешние ресурсы не загружаются: материал дела не должен порождать сетевых
    // запросов, а шрифты для извлечения текста не нужны.
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });

  const document = await task.promise;
  const units = [];
  try {
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items.map((item) => item.str ?? '').join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 0) units.push({ kind: 'page', ref: page, text });
    }
  } finally {
    // В разных сборках pdfjs освобождение называется по-разному; незакрытый документ
    // держит память процесса, который разбирает документы пачками.
    if (typeof document.cleanup === 'function') await document.cleanup();
    if (typeof task.destroy === 'function') await task.destroy();
  }

  if (units.length === 0) {
    // Пустой результат — не успех: скорее всего это скан, который требует
    // распознавания, и следователь должен об этом узнать.
    throw new Error(
      'В PDF не найдено текста. Вероятно, это скан: требуется распознавание, '
      + 'которое пока не реализовано. Оригинал сохранён.',
    );
  }

  return {
    text: truncate(units.map((u) => `[стр. ${u.ref}] ${u.text}`).join('\n\n')),
    format: 'pdf',
    units,
    metadata: { pages: document.numPages, pages_with_text: units.length },
  };
}

function extractJson(buffer) {
  const raw = truncate(new TextDecoder('utf-8').decode(buffer));
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Материал заявлен как JSON, но не разбирается: ${error.message}`);
  }

  const records = Array.isArray(parsed) ? parsed : [parsed];
  const units = records.map((record, index) => ({
    kind: 'record',
    ref: record?.id ?? record?.message_id ?? index + 1,
    text: JSON.stringify(record),
  }));

  return { text: raw, format: 'json', units, metadata: { records: units.length } };
}

/**
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {{mimeType?: string, filename?: string}} meta
 * @returns {Promise<ExtractedDocument>}
 */
export async function extractDocument(buffer, meta = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const mime = (meta.mimeType ?? '').toLowerCase();
  const name = (meta.filename ?? '').toLowerCase();

  if (mime.includes('pdf') || name.endsWith('.pdf')) return extractPdf(bytes.buffer ?? bytes);
  if (mime.includes('csv') || name.endsWith('.csv') || name.endsWith('.tsv')) return extractCsv(bytes);
  if (mime.includes('json') || name.endsWith('.json')) return extractJson(bytes);
  if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return extractPlain(bytes);

  if (mime.startsWith('image/')) {
    throw new Error(
      'Изображения пока не распознаются. Оригинал сохранён и доступен для просмотра.',
    );
  }

  // Неизвестный формат разбирается как текст: если это действительно текст,
  // материал не пропадёт, а если нет — извлечённое будет очевидно бессмысленным.
  return extractPlain(bytes);
}
