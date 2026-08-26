/**
 * Сборка ZIP без внешних зависимостей.
 *
 * Нужна в двух местах: выгрузка отчёта в DOCX (OOXML — это ZIP) и выгрузка всех данных
 * арендатора (§60 ТЗ). Второй случай определил устройство: архив дела на сотни мегабайт
 * нельзя держать в памяти, поэтому писатель пишет на диск по мере поступления записей,
 * а центральный каталог собирает по ходу.
 */

import { open } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 1 января 1980 года — наименьшая дата, представимая в ZIP.
 * Отметка фиксированная: одна и та же выгрузка обязана давать одинаковый файл,
 * а нулевая дата (месяц 0, день 0) недопустима, и часть читателей такой архив
 * открывать отказывается.
 */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

function localHeader(nameBytes, crc, compressedSize, size) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // имена в UTF-8
  header.writeUInt16LE(8, 8); // deflate
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  return header;
}

function centralHeader(nameBytes, crc, compressedSize, size, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt32LE(offset, 42);
  return header;
}

function endOfCentralDirectory(count, centralSize, centralOffset) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return end;
}

/**
 * Архив целиком в памяти. Годится для документов известного небольшого размера.
 *
 * @param {Array<{name: string, data: Uint8Array}>} entries
 * @returns {Buffer}
 */
export function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf-8');
    const data = Buffer.from(entry.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    chunks.push(localHeader(nameBytes, crc, compressed.length, data.length), nameBytes, compressed);
    central.push(centralHeader(nameBytes, crc, compressed.length, data.length, offset), nameBytes);
    offset += 30 + nameBytes.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  return Buffer.concat([
    ...chunks, centralBuffer, endOfCentralDirectory(entries.length, centralBuffer.length, offset),
  ]);
}

/**
 * Пишущий архив: записи уходят на диск по мере добавления.
 *
 * @param {string} path
 */
export async function createZipWriter(path) {
  const handle = await open(path, 'w');
  const central = [];
  let offset = 0;

  return {
    /**
     * @param {string} name
     * @param {Uint8Array|string} data
     */
    async add(name, data) {
      const nameBytes = Buffer.from(name, 'utf-8');
      const bytes = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
      const compressed = deflateRawSync(bytes);
      const crc = crc32(bytes);

      await handle.write(localHeader(nameBytes, crc, compressed.length, bytes.length));
      await handle.write(nameBytes);
      await handle.write(compressed);

      central.push(centralHeader(nameBytes, crc, compressed.length, bytes.length, offset), nameBytes);
      offset += 30 + nameBytes.length + compressed.length;
    },

    async close() {
      const centralBuffer = Buffer.concat(central);
      await handle.write(centralBuffer);
      await handle.write(endOfCentralDirectory(
        central.length / 2, centralBuffer.length, offset,
      ));
      await handle.close();
      return { bytes: offset + centralBuffer.length + 22, entries: central.length / 2 };
    },
  };
}
