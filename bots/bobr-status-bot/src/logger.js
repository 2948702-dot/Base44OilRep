const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function write(level, message, extra) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(extra === undefined ? `${line}\n` : `${line} ${safe(extra)}\n`);
}

function safe(value) {
  if (value instanceof Error) return `${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  debug: (m, e) => write('debug', m, e),
  info: (m, e) => write('info', m, e),
  warn: (m, e) => write('warn', m, e),
  error: (m, e) => write('error', m, e),
};
