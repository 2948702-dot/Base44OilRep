/**
 * Файловое хранилище на диске сервера.
 *
 * Оригиналы лежат на смонтированном томе, путь определяется хэшем содержимого:
 * один и тот же файл, загруженный дважды, не дублируется, а имя файла не влияет
 * на место хранения и не может увести запись за пределы каталога.
 *
 * Запись выполняется в режиме, запрещающем перезапись существующего файла: оригинал
 * не изменяется никогда (§54, §71 ТЗ).
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { assertImplements } from '../contracts.js';
import { sha256Hex } from '../../domain/hash.js';

/**
 * @param {{root?: string}} [options]
 */
export function createFileRepository(options = {}) {
  const root = resolve(
    options.root ?? process.env.INVESTIGATION_FILE_ROOT ?? '/var/lib/investigation/sources',
  );

  function pathFor(sha256) {
    return join(root, sha256.slice(0, 2), sha256.slice(2, 4), sha256);
  }

  const repository = {
    /**
     * @param {Buffer|Blob|Uint8Array} file
     * @param {{filename: string, mimeType: string}} meta
     */
    async upload(file, meta) {
      const bytes = file instanceof Uint8Array
        ? file
        : new Uint8Array(await file.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      const target = pathFor(sha256);

      await mkdir(dirname(target), { recursive: true });
      try {
        // wx: существующий оригинал не перезаписывается ни при каких условиях.
        await writeFile(target, bytes, { flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }

      return { uri: `file://${target}`, sha256, byteSize: bytes.byteLength, filename: meta.filename };
    },

    async read(uri) {
      const raw = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
      // Сравнение строк здесь недостаточно: «<root>/../../etc/shadow» начинается с root
      // и проходит проверку, а readFile честно разрешит «..». Путь сначала приводится
      // к нормальному виду, и только потом сравнивается — с разделителем на конце,
      // чтобы «<root>-backup» не считался тем же хранилищем.
      const path = resolve(raw);
      if (path !== root && !path.startsWith(root.endsWith(sep) ? root : root + sep)) {
        throw new Error(`Отказано: путь ${raw} вне хранилища источников`);
      }
      const buffer = await readFile(path);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },

    async verifyIntegrity(uri, expectedSha256) {
      const bytes = await repository.read(uri);
      return (await sha256Hex(bytes)) === expectedSha256;
    },
  };

  assertImplements('FileRepository', repository, 'DiskFileRepository');
  return repository;
}
