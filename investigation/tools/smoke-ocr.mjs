/**
 * Проверка распознавания текста на настоящем скане (§26 ТЗ).
 *
 * Запуск: node investigation/tools/smoke-ocr.mjs
 *
 * Заготовленное распознавание в проверке очереди показывает, что шаги идут в нужном
 * порядке. Здесь проверяется другое: что программа распознавания вообще установлена,
 * что русские данные на месте и что кириллица читается, а не превращается в латиницу.
 * Обе ошибки — отсутствие языковых данных и подмена алфавита — обнаруживаются только
 * на настоящем изображении.
 *
 * Если tesseract на машине нет, проверка сообщает об этом и завершается успешно:
 * останавливать сборку из-за отсутствия программы у разработчика бессмысленно.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTesseractClient, isLowConfidence } from '../../src/investigation/server/ocr.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN = join(HERE, '..', '..', 'src', 'investigation', 'fixtures', 'scans', 'kassa.png');

/** Строки, которые обязаны прочитаться: без них скан бесполезен для расследования. */
const EXPECTED = [
  'кассовая книга',
  '24 августа',
  '12 000',
  '74 000',
  'петрова',
];

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
}

const image = await readFile(SCAN);
const client = createTesseractClient();

let recognised;
try {
  recognised = await client.recognize(image, { filename: 'kassa.png' });
} catch (error) {
  if (error.message.includes('недоступна на сервере')) {
    console.log('tesseract не установлен — проверка распознавания пропущена.');
    console.log('На сервере он ставится вместе с образом: см. investigation/deploy/Dockerfile.');
    process.exit(0);
  }
  throw error;
}

const text = recognised.text.toLowerCase().replace(/ё/g, 'е');

check('Скан распознан', recognised.text.length > 50, `${recognised.words} слов`);
check('Уверенность распознавания приемлема',
  !isLowConfidence(recognised.confidence), `${recognised.confidence}%`);
check('Кириллица прочитана как кириллица',
  /[а-я]/.test(text) && (text.match(/[а-я]/g) ?? []).length > (text.match(/[a-z]/g) ?? []).length,
  'русские данные распознавания на месте');
check('Разбиение на строки сохранено', recognised.text.split('\n').length >= 5,
  `строк: ${recognised.text.split('\n').length}`);

for (const fragment of EXPECTED) {
  check(`Прочитано: «${fragment}»`, text.includes(fragment));
}

const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
if (failed.length > 0) {
  console.log('\nРаспознанный текст:\n' + recognised.text);
}
console.log(`\n${results.length - failed.length}/${results.length} проверок распознавания пройдено`);
process.exit(failed.length === 0 ? 0 : 1);
