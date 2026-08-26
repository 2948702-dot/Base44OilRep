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
import { assertClaimIsAttributed } from '../engine/invariants.js';
import { createAgentContext } from '../agents/framework/AgentContext.js';
import { isLowConfidence } from '../server/ocr.js';
import { getAgent } from '../agents/registry.js';

export function createSourceService({ repositories, scope, llm, extractDocument }) {
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
          notes: meta.notes ?? null,
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
        // Пометка о происхождении текста видна следователю рядом с самим текстом:
        // распознанный программой документ не должен выглядеть как прочитанный человеком.
        notes: meta.notes ?? null,
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
     * Разбор приобщённого материала (§26 ТЗ).
     *
     * Текст извлекается с сохранением привязки к месту в оригинале и сохраняется
     * отдельным производным источником. Оригинал не изменяется никогда.
     *
     * Утверждения, извлечённые из документа, получают source_locator: без него
     * утверждение нельзя показать в оригинале, а вывод на нём нельзя защитить.
     */
    /**
     * Распознавание текста на скане или фотографии документа (§26 ТЗ).
     *
     * Изображение остаётся первичным материалом и не изменяется. Распознанный текст
     * появляется рядом производным источником — с указанием, что читал не человек,
     * и с уверенностью распознавания. Утверждение, извлечённое из такого текста,
     * ссылается на строку в нём и через неё — на исходное изображение.
     *
     * @param {string} sourceId
     * @param {{ocr?: Object}} [options]
     */
    async ocrSource(sourceId, { ocr } = {}) {
      if (!ocr) throw new Error('Распознавание скана требует клиента OCR');

      const source = await repositories.sources.get(sourceId);
      if (!source) throw new Error(`Источник ${sourceId} не найден`);
      if (!source.original_file) throw new Error(`У источника ${sourceId} нет файла изображения`);

      const image = await repositories.files.read(source.original_file);
      const result = await ocr.recognize(image, {
        filename: source.original_filename ?? 'scan',
      });

      const lowConfidence = isLowConfidence(result.confidence);
      const derived = await this.createDerivedSource(sourceId, {
        type: 'document',
        text: result.text,
        method: `ocr:tesseract:${result.languages}`,
        meta: {
          title: `Распознанный текст ${source.title ?? source.original_filename ?? sourceId}`,
          notes: `Распознано программой, уверенность ${result.confidence ?? '—'}%, слов: ${result.words}.`
            + (lowConfidence
              ? ' Уверенность низкая: текст требует сверки с оригиналом до использования в выводах.'
              : ''),
        },
      });

      return {
        derivedSourceId: derived.id,
        text: result.text,
        confidence: result.confidence,
        words: result.words,
        lowConfidence,
      };
    },

    async analyzeDocument(sourceId) {
      if (!llm) throw new Error('Разбор документа требует клиента модели');
      if (!extractDocument) throw new Error('Разбор документа требует извлечения текста');

      const source = await repositories.sources.get(sourceId);
      if (!source) throw new Error(`Источник ${sourceId} не найден`);

      const bytes = source.original_file
        ? await repositories.files.read(source.original_file)
        : new TextEncoder().encode(source.extracted_text ?? '');

      const extracted = await extractDocument(bytes, {
        mimeType: source.mime_type,
        filename: source.original_filename ?? source.title,
      });

      const derived = await this.createDerivedSource(sourceId, {
        type: 'document',
        text: extracted.text,
        method: `extract:${extracted.format}`,
        meta: { title: `Извлечённый текст ${source.title ?? source.original_filename ?? sourceId}` },
      });

      const context = createAgentContext({
        caseId: source.case_id,
        organizationId: scope.organizationId,
        actorId: scope.actorId,
        actorType: 'agent',
        repositories,
        llm,
      });

      const agent = getAgent('document_analyst');
      const result = await agent.runWithMetadata({ sourceId, extracted }, context);
      const analysis = result.output;

      const existing = await repositories.claims.list({}, { includeDeleted: true });
      const codes = existing.map((c) => c.claim_code);

      const created = [];
      for (const claim of analysis.claims) {
        const code = nextCode('claim', codes);
        codes.push(code);

        // Привязка переводится в source_locator того же вида, что и у утверждений
        // из интервью: следователь не должен различать, откуда пришло утверждение,
        // чтобы найти его в оригинале.
        const locator = {};
        if (claim.locator_kind === 'page') locator.page = Number(claim.locator_ref) || null;
        else if (claim.locator_kind === 'line') locator.line = Number(claim.locator_ref) || null;
        else if (claim.locator_kind === 'row') locator.row_id = String(claim.locator_ref);
        else if (claim.locator_kind === 'record') locator.message_id = String(claim.locator_ref);
        else locator.page = null;

        const record = {
          case_id: source.case_id,
          claim_code: code,
          source_id: sourceId,
          source_person_id: source.source_person_id ?? null,
          text: claim.text,
          normalized_statement: claim.normalized_statement,
          claim_type: claim.claim_type,
          subject_entity: claim.subject_entity,
          predicate: claim.predicate,
          object_entity: claim.object_entity,
          time_start: claim.time_start,
          time_end: claim.time_end,
          time_precision: claim.time_precision,
          amount: claim.amount,
          currency: claim.currency,
          // Документ не говорит «кажется»: он фиксирует. Неопределённость документа
          // выражается типом утверждения, а не степенью уверенности говорящего.
          speaker_certainty: 'certain',
          ai_extraction_confidence: claim.ai_extraction_confidence,
          corroboration_status: 'uncorroborated',
          verification_status: 'unverified',
          source_locator: locator,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
          reviewed_by_human: false,
        };

        if (claim.locator_kind !== 'unknown') assertClaimIsAttributed(record);
        created.push(await repositories.claims.create(record));
      }

      // Признаки подмены инструкций сохраняются в самом источнике: это свойство
      // материала, которое следователь обязан видеть рядом с ним, а не в журнале.
      const markers = [
        ...analysis.suspicious_content,
        ...detectInjectionMarkers(extracted.text),
      ];
      if (markers.length > 0) {
        await repositories.sources.update(sourceId, {
          notes: `Обнаружены признаки подмены инструкций в материале: ${markers.join(' | ')}`,
        });
      }

      return {
        derivedSourceId: derived.id,
        classification: analysis.classification,
        entities: analysis.entities,
        dates: analysis.dates,
        amounts: analysis.amounts,
        claims: created,
        suspiciousContent: markers,
        extraction: { format: extracted.format, units: extracted.units.length },
        agentRunId: result.run.id,
      };
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
