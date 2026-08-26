/**
 * Подсистема источников и доказательств (§8, §9, §54 ТЗ).
 *
 * Разделение Source и Evidence принципиально: файл сам по себе — источник. Он становится
 * доказательством только после того, как определено его отношение к расследованию.
 * Оригинал не изменяется никогда; обработанная версия создаётся как отдельный derived Source.
 */

import { sha256OfText } from '../domain/hash.js';
import { nextCode } from '../domain/codes.js';
import { detectInjectionMarkers } from '../agents/framework/promptEnvelope.js';

export function createSourceService({ repositories, scope }) {
  async function nextEvidenceCode() {
    const existing = await repositories.evidence.list({}, { includeDeleted: true });
    return nextCode('evidence', existing.map((e) => e.evidence_code));
  }

  return {
    /**
     * Приём файла. Хэш считается до загрузки, чтобы целостность можно было проверить
     * независимо от хранилища.
     *
     * @param {File|Blob} file
     * @param {Object} meta
     */
    async ingestFile(file, meta) {
      const uploaded = await repositories.files.upload(file, {
        filename: meta.filename ?? file.name ?? 'file',
        mimeType: meta.mimeType ?? file.type ?? 'application/octet-stream',
      });

      return repositories.sources.create({
        type: meta.type,
        title: meta.title ?? meta.filename ?? file.name ?? null,
        original_file: uploaded.uri,
        sha256: uploaded.sha256,
        original_filename: meta.filename ?? file.name ?? null,
        mime_type: meta.mimeType ?? file.type ?? null,
        byte_size: uploaded.byteSize,
        created_at_original: meta.createdAtOriginal ?? null,
        received_at: new Date().toISOString(),
        uploaded_by: scope.actorId,
        source_person_id: meta.sourcePersonId ?? null,
        system_origin: meta.systemOrigin ?? null,
        integrity_status: 'verified',
        is_derived: false,
        untrusted_content: true,
      });
    },

    /**
     * Приём текстового материала (сообщение, вставленный фрагмент переписки, описание).
     * Хэшируется так же, как файл: текст тоже обязан иметь неизменяемый оригинал.
     */
    async ingestText(text, meta) {
      const sha256 = await sha256OfText(text);
      return repositories.sources.create({
        type: meta.type ?? 'external_source',
        title: meta.title ?? null,
        extracted_text: text,
        sha256,
        mime_type: 'text/plain',
        byte_size: text.length,
        created_at_original: meta.createdAtOriginal ?? null,
        received_at: new Date().toISOString(),
        uploaded_by: scope.actorId,
        source_person_id: meta.sourcePersonId ?? null,
        integrity_status: 'verified',
        is_derived: false,
        untrusted_content: true,
      });
    },

    /**
     * Создаёт производный источник: транскрипт, OCR, нормализованную таблицу.
     * Оригинал остаётся нетронутым и остаётся первичным доказательством.
     */
    async createDerivedSource(originalSourceId, { type, text, method, file, meta = {} }) {
      const original = await repositories.sources.get(originalSourceId);
      if (!original) throw new Error(`Источник ${originalSourceId} не найден`);

      if (file) {
        const uploaded = await repositories.files.upload(file, {
          filename: meta.filename ?? 'derived',
          mimeType: meta.mimeType ?? 'application/octet-stream',
        });
        return repositories.sources.create({
          type,
          title: meta.title ?? `${original.title ?? original.type} (${method})`,
          original_file: uploaded.uri,
          sha256: uploaded.sha256,
          mime_type: meta.mimeType ?? null,
          byte_size: uploaded.byteSize,
          received_at: new Date().toISOString(),
          uploaded_by: scope.actorId,
          source_person_id: original.source_person_id,
          integrity_status: 'verified',
          is_derived: true,
          derived_from_source_id: originalSourceId,
          derivation_method: method,
          untrusted_content: true,
        });
      }

      return repositories.sources.create({
        type,
        title: meta.title ?? `${original.title ?? original.type} (${method})`,
        extracted_text: text,
        sha256: await sha256OfText(text ?? ''),
        mime_type: 'text/plain',
        byte_size: (text ?? '').length,
        received_at: new Date().toISOString(),
        uploaded_by: scope.actorId,
        source_person_id: original.source_person_id,
        integrity_status: 'verified',
        is_derived: true,
        derived_from_source_id: originalSourceId,
        derivation_method: method,
        untrusted_content: true,
      });
    },

    /**
     * Повторная проверка целостности. Расхождение хэша — не техническая мелочь:
     * такой источник не может использоваться как доказательство до выяснения.
     */
    async verifyIntegrity(sourceId) {
      const source = await repositories.sources.get(sourceId);
      if (!source) throw new Error(`Источник ${sourceId} не найден`);
      if (!source.original_file) {
        return { status: source.integrity_status, checked: false };
      }
      const ok = await repositories.files.verifyIntegrity(source.original_file, source.sha256);
      const status = ok ? 'verified' : 'mismatch';
      if (status !== source.integrity_status) {
        await repositories.sources.update(sourceId, { integrity_status: status });
      }
      return { status, checked: true };
    },

    /**
     * Превращает источник в доказательство, фиксируя его отношение к расследованию.
     */
    async promoteToEvidence(sourceId, { type, description, relevance, reliability, sourceLocator }) {
      const source = await repositories.sources.get(sourceId);
      if (!source) throw new Error(`Источник ${sourceId} не найден`);
      if (source.integrity_status === 'mismatch') {
        throw new Error(
          `Источник ${sourceId} не проходит проверку целостности и не может стать доказательством`,
        );
      }

      return repositories.evidence.create({
        evidence_code: await nextEvidenceCode(),
        source_id: sourceId,
        type,
        description,
        relevance: relevance ?? 'medium',
        reliability: reliability ?? 'unknown',
        integrity: source.integrity_status === 'verified' ? 'intact' : 'unknown',
        collected_at: source.received_at,
        collected_by: scope.actorId,
        original_hash: source.sha256,
        storage_uri: source.original_file,
        source_locator: sourceLocator ?? null,
      });
    },

    /**
     * Проверка материала на попытку подмены инструкций. Результат не блокирует работу,
     * а фиксируется как наблюдение о материале (§61 ТЗ).
     */
    async scanForInjection(sourceId) {
      const source = await repositories.sources.get(sourceId);
      if (!source) throw new Error(`Источник ${sourceId} не найден`);
      const markers = detectInjectionMarkers(source.extracted_text ?? '');
      return { sourceId, markers, suspicious: markers.length > 0 };
    },
  };
}
