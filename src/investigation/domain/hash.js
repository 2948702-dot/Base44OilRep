/**
 * SHA-256 для контроля целостности источников.
 *
 * Хэш считается при приёме файла и при каждой повторной проверке. Расхождение означает,
 * что оригинал изменён или повреждён; такой Source получает `integrity_status = mismatch`
 * и не может использоваться как Evidence до выяснения (§9, §54 ТЗ).
 */

/**
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<string>} шестнадцатеричный хэш в нижнем регистре
 */
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto недоступен: SHA-256 обязателен для приёма источника');
  }
  const buffer = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const digest = await subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function sha256OfBlob(blob) {
  return sha256Hex(await blob.arrayBuffer());
}

/**
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256OfText(text) {
  return sha256Hex(new TextEncoder().encode(text));
}
