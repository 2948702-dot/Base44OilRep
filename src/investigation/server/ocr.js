/**
 * Распознавание текста на сканах и фотографиях документов (§26 ТЗ).
 *
 * Работает на том же сервере, что и всё остальное: скан приказа, ведомости или
 * объяснительной не уезжает во внешний сервис. Для платформы, обрабатывающей материалы
 * внутренних расследований, это условие, а не оптимизация.
 *
 * В отличие от распознавания речи, отдельного контейнера здесь нет: tesseract —
 * обычная программа, а не модель на несколько гигабайт, и живёт прямо в образе API.
 * Меньше движущихся частей — меньше поводов для отказа в момент, когда материал нужен.
 *
 * Распознанный текст никогда не подменяет оригинал: он становится производным
 * источником рядом с изображением (§54, §71 ТЗ). Уверенность распознавания
 * сохраняется вместе с текстом — следователь должен видеть, что читал не человек,
 * а программа, и насколько уверенно.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const DEFAULT_LANGUAGES = 'rus+eng';
const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Доля распознанных слов, ниже которой результату нельзя доверять без глаз человека.
 * Порог намеренно щедрый: задача не отсечь плохое распознавание, а не выдать мусор
 * за прочитанный документ.
 */
const LOW_CONFIDENCE = 60;

/**
 * @typedef {Object} OcrClient
 * @property {(image: ArrayBuffer|Uint8Array, meta: {filename?: string, languages?: string}) =>
 *   Promise<{text: string, confidence: number|null, words: number, languages: string}>} recognize
 */

/**
 * @param {{binary?: string, languages?: string}} [options]
 * @returns {OcrClient}
 */
export function createTesseractClient(options = {}) {
  const binary = options.binary ?? process.env.TESSERACT_BINARY ?? 'tesseract';
  const defaultLanguages = options.languages ?? process.env.OCR_LANGUAGES ?? DEFAULT_LANGUAGES;

  return {
    async recognize(image, meta = {}) {
      const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
      const languages = meta.languages ?? defaultLanguages;
      const directory = await mkdtemp(join(tmpdir(), 'investigation-ocr-'));
      const input = join(directory, meta.filename?.replace(/[^\w.-]/g, '_') || 'scan');

      try {
        await writeFile(input, bytes);

        // Текст и данные о распознавании берутся за один проход в формате TSV:
        // в нём есть уверенность по каждому слову, а значит есть чем ответить
        // на вопрос «насколько этому тексту можно верить».
        const { stdout } = await run(
          binary,
          [input, 'stdout', '-l', languages, '--psm', '3', 'tsv'],
          { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
        );

        const parsed = parseTsv(stdout);
        if (!parsed.text) {
          // Пустой результат — не успех. Изображение могло не содержать текста,
          // но увидеть это должен следователь, а не система, молча записавшая пустоту.
          throw new Error(
            'Распознавание не нашло текста. Оригинал сохранён: возможно, это фотография '
            + 'без документа или скан слишком низкого качества.',
          );
        }

        return { ...parsed, languages };
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(
            'Программа распознавания текста недоступна на сервере. Оригинал сохранён '
            + 'и доступен для просмотра.',
          );
        }
        if (error.killed) {
          throw new Error('Распознавание не уложилось в отведённое время. Оригинал сохранён.');
        }
        throw error;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Разбирает вывод tesseract в формате TSV.
 *
 * Строки собираются по номеру строки в блоке: сохранить разбиение на строки важно —
 * утверждение из распознанного документа ссылается на строку, и без этого ссылка
 * указывала бы на документ целиком.
 */
function parseTsv(tsv) {
  const rows = String(tsv ?? '').split('\n').slice(1);
  const lines = new Map();
  const confidences = [];

  for (const row of rows) {
    const parts = row.split('\t');
    if (parts.length < 12) continue;
    const [, , block, paragraph, line, , , , , , confidence] = parts;
    const word = parts[11]?.trim();
    if (!word) continue;

    const numeric = Number(confidence);
    if (Number.isFinite(numeric) && numeric >= 0) confidences.push(numeric);

    const key = `${block}:${paragraph}:${line}`;
    lines.set(key, `${lines.get(key) ?? ''}${lines.has(key) ? ' ' : ''}${word}`);
  }

  const text = [...lines.values()].join('\n').trim();
  const confidence = confidences.length === 0
    ? null
    : Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);

  return { text, confidence, words: confidences.length };
}

/** Ниже этого порога распознанному тексту нельзя верить без проверки человеком. */
export function isLowConfidence(confidence) {
  return confidence !== null && confidence < LOW_CONFIDENCE;
}

export { LOW_CONFIDENCE };

/**
 * Заготовленное распознавание для приёмочного прогона и разработки без tesseract.
 * @param {string[]} texts
 * @returns {OcrClient}
 */
export function createStubOcrClient(texts = []) {
  const queue = [...texts];
  return {
    async recognize() {
      const next = queue.shift();
      if (next === undefined) throw new Error('Stub-распознавание исчерпало заготовки');
      return { text: next, confidence: 92, words: next.split(/\s+/).length, languages: 'rus' };
    },
  };
}
