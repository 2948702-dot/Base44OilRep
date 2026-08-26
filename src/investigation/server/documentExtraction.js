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

import { inflateRawSync } from 'node:zlib';

const MAX_TEXT_LENGTH = 2_000_000;

/**
 * @typedef {Object} ExtractedDocument
 * @property {string} text
 * @property {'plain'|'csv'|'pdf'|'json'|'docx'} format
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
 * Минимальный читатель ZIP: docx и xlsx — это ZIP-контейнеры.
 *
 * Раньше такой файл уходил в разбор как текст, декодировался как UTF-8 и превращался
 * в мусор, из которого агент честно извлекал «утверждения». Ошибки при этом не было:
 * следователь видел «разбор выполнен» и получал вымысел вместо документа.
 *
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>|null} содержимое по именам файлов внутри архива
 */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const EOCD = 0x06054b50;

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66_000; i -= 1) {
    if (view.getUint32(i, true) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder('utf-8');

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) return null;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (view.getUint32(localOffset, true) === 0x04034b50) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);
      try {
        entries.set(name, method === 0 ? raw : inflateRawSync(raw));
      } catch {
        return null;
      }
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Текст абзацев Word без разметки. */
function docxParagraphs(xml) {
  return xml
    .split(/<\/w:p>/)
    .map((chunk) => chunk
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim())
    .filter((line) => line.length > 0);
}

/**
 * @param {Uint8Array} bytes
 * @returns {ExtractedDocument}
 */
function extractDocx(bytes) {
  const entries = readZip(bytes);
  const document = entries?.get('word/document.xml');
  if (!document) {
    throw new Error(
      'Файл выглядит как документ Word, но его содержимое не читается. '
      + 'Оригинал сохранён; приложите текстовую версию или PDF.',
    );
  }

  const paragraphs = docxParagraphs(new TextDecoder('utf-8').decode(document));
  const text = truncate(paragraphs.join('\n'));
  const units = paragraphs.map((paragraph, index) => ({
    kind: 'paragraph',
    ref: index + 1,
    text: paragraph,
  }));

  return { text, format: 'docx', units, metadata: { paragraphs: paragraphs.length } };
}

/** Признак двоичного файла: управляющие байты, которых не бывает в тексте. */
function looksBinary(bytes) {
  const sample = bytes.subarray(0, 4096);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.05;
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

  if (mime.includes('wordprocessingml') || name.endsWith('.docx')) return extractDocx(bytes);

  if (mime.includes('spreadsheetml') || name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    throw new Error(
      'Таблицы Excel пока не разбираются. Выгрузите лист в CSV и приложите его: '
      + 'оригинал остаётся в деле и не заменяется выгрузкой.',
    );
  }

  if (name.endsWith('.doc') || name.endsWith('.xls') || name.endsWith('.rtf')) {
    throw new Error(
      'Формат устаревшего Office пока не разбирается. Пересохраните материал в PDF, '
      + 'DOCX или CSV; оригинал остаётся в деле.',
    );
  }

  if (mime.startsWith('image/')) {
    throw new Error(
      'Изображения пока не распознаются. Оригинал сохранён и доступен для просмотра.',
    );
  }

  // Неизвестный двоичный формат отклоняется явно. Прежде он разбирался как текст:
  // ошибки не возникало, а в дело попадали утверждения, извлечённые из мусора.
  if (looksBinary(bytes)) {
    throw new Error(
      `Формат материала не распознан (${meta.mimeType || 'без типа'}). `
      + 'Оригинал сохранён. Приложите текстовую версию, PDF или CSV.',
    );
  }

  return extractPlain(bytes);
}
