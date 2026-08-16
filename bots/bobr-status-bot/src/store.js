import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { logger } from './logger.js';

export function emptyState() {
  return {
    version: 1,
    updateOffset: 0,
    lastId: 0,
    agreements: [],
    // Сообщения, ещё не отданные анализатору.
    pending: [],
    // Последние разобранные сообщения — контекст для следующего разбора.
    recent: [],
    lastAnalyzedAt: null,
    lastDigestDate: null,
    paused: false,
  };
}

export function loadState(file) {
  if (!existsSync(file)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return { ...emptyState(), ...parsed };
  } catch (error) {
    logger.error('Файл состояния повреждён, начинаю с чистого', { file, error: error.message });
    return emptyState();
  }
}

export function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, file);
}
