/**
 * Расшифровка голосовых ответов.
 *
 * Модель распознавания работает на том же сервере, поэтому голос сотрудника никуда
 * не уезжает: для платформы, которая продаётся российским компаниям и обрабатывает
 * персональные данные, это не оптимизация, а условие.
 *
 * Плата за это — процессорное время. Задачи расшифровки идут по одной через ту же
 * очередь, а контейнер распознавания ограничен по ядрам, чтобы не вытеснить с сервера
 * n8n и ботов, которые там уже живут.
 *
 * Оригинал записи неизменяем: расшифровка создаётся отдельным производным источником
 * и никогда не подменяет собой звук (§3, §54, §71 ТЗ).
 */

const DEFAULT_URL = 'http://investigation-whisper:9000';
const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * @typedef {Object} TranscriptionClient
 * @property {(audio: ArrayBuffer|Uint8Array, meta: {filename: string, mimeType: string, language?: string}) => Promise<{text: string, language: string|null, segments: Array<Object>}>} transcribe
 */

/**
 * @param {{url?: string, language?: string}} [options]
 * @returns {TranscriptionClient}
 */
export function createWhisperClient(options = {}) {
  const baseUrl = (options.url ?? process.env.WHISPER_URL ?? DEFAULT_URL).replace(/\/$/, '');
  const defaultLanguage = options.language ?? process.env.WHISPER_LANGUAGE ?? 'ru';

  return {
    async transcribe(audio, meta) {
      const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
      const form = new FormData();
      form.append(
        'audio_file',
        new Blob([bytes], { type: meta.mimeType || 'application/octet-stream' }),
        meta.filename || 'audio',
      );

      const params = new URLSearchParams({
        task: 'transcribe',
        language: meta.language ?? defaultLanguage,
        output: 'json',
        // Метки времени нужны как source_locator для утверждений: без них нельзя
        // сослаться на конкретное место записи.
        word_timestamps: 'false',
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response;
      try {
        response = await fetch(`${baseUrl}/asr?${params}`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error(
            'Расшифровка не уложилась в отведённое время. Запись сохранена: '
            + 'её можно расшифровать повторно или прослушать вручную.',
          );
        }
        throw new Error(`Служба расшифровки недоступна: ${error.message}`);
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Расшифровка не удалась: HTTP ${response.status} ${detail.slice(0, 300)}`);
      }

      const payload = await response.json();
      const text = String(payload.text ?? '').trim();
      if (!text) {
        // Пустая расшифровка — не успех: запись могла быть тишиной, но это должен
        // увидеть следователь, а не система, молча записавшая пустой ответ.
        throw new Error('Расшифровка пуста: запись требует ручной проверки');
      }

      return {
        text,
        language: payload.language ?? null,
        segments: Array.isArray(payload.segments) ? payload.segments : [],
      };
    },
  };
}

/**
 * Заготовленная расшифровка для приёмочного прогона и разработки без модели.
 * @param {string[]} texts
 * @returns {TranscriptionClient}
 */
export function createStubTranscriptionClient(texts = []) {
  const queue = [...texts];
  return {
    async transcribe() {
      const next = queue.shift();
      if (next === undefined) throw new Error('Stub-расшифровка исчерпала заготовки');
      return { text: next, language: 'ru', segments: [] };
    },
  };
}
