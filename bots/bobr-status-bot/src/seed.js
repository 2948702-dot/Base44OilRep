import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { loadState, saveState } from './store.js';
import { createAgreement } from './agreements.js';
import { logger } from './logger.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Разово наполняет реестр договорённостями, собранными вручную из истории
 * переписки. Повторный запуск ничего не делает, если реестр уже не пуст.
 */
export function seed({ configLoader = loadConfig, file = resolve(root, 'seed.json'), force = false } = {}) {
  const config = configLoader();
  const state = loadState(config.dataFile);

  if (state.agreements.length > 0 && !force) {
    logger.info(`Реестр уже содержит ${state.agreements.length} записей, посев пропущен. Нужен всё равно — запустите с --force`);
    return state;
  }

  const { agreements } = JSON.parse(readFileSync(file, 'utf8'));
  for (const item of agreements) {
    createAgreement(state, { ...item, by: 'seed' });
  }

  saveState(config.dataFile, state);
  logger.info(`Загружено договорённостей: ${agreements.length}`, { файл: config.dataFile });
  return state;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seed({ force: process.argv.includes('--force') });
}
