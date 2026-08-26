/**
 * Файловое хранилище поверх Base44.
 *
 * Оригинал не изменяется никогда. Обработанная версия (транскрипт, OCR, нормализованная
 * таблица) загружается как отдельный файл и оформляется как derived Source (§54 ТЗ).
 */

import { assertImplements } from '../contracts.js';
import { sha256OfBlob, sha256Hex } from '../../domain/hash.js';

/**
 * @param {{client: Object}} params
 */
export function createFileRepository({ client }) {
  const repository = {
    /**
     * @param {File|Blob} file
     * @param {{filename: string, mimeType: string}} meta
     */
    async upload(file, meta) {
      const sha256 = await sha256OfBlob(file);
      const { file_url: uri } = await client.integrations.Core.UploadFile({ file });
      if (!uri) throw new Error(`Загрузка файла ${meta.filename} не вернула ссылку`);
      return { uri, sha256, byteSize: file.size ?? 0 };
    },

    async read(uri) {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Не удалось прочитать источник ${uri}: HTTP ${response.status}`);
      }
      return response.arrayBuffer();
    },

    async verifyIntegrity(uri, expectedSha256) {
      const bytes = await repository.read(uri);
      const actual = await sha256Hex(bytes);
      return actual === expectedSha256;
    },
  };

  assertImplements('FileRepository', repository, 'Base44FileRepository');
  return repository;
}
