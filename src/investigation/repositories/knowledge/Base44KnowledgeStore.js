/**
 * KnowledgeStore поверх Base44.
 *
 * Первая реализация намеренно скромная: полнотекстовый и лексический поиск без векторов.
 * Интерфейс совпадает с будущей реализацией на PostgreSQL + pgvector (§55 ТЗ), поэтому
 * замена не затронет вызывающий код.
 *
 * Жёсткое правило: пространство методологии и пространство дела не смешиваются, а
 * материалы одного tenant недоступны другому. Оба ограничения проверяются здесь, а не
 * в вызывающем коде (§49, §58 ТЗ).
 */

import { assertImplements } from '../contracts.js';

const SPACES = ['methodology', 'case'];

function assertQuery(query) {
  if (!query?.organizationId) {
    throw new Error('Запрос к KnowledgeStore без organizationId запрещён');
  }
  if (!SPACES.includes(query.space)) {
    throw new Error(`Запрос к KnowledgeStore требует space: ${SPACES.join(' | ')}`);
  }
  if (query.space === 'case' && !query.caseId) {
    throw new Error('Поиск в пространстве дела требует caseId');
  }
}

function score(text, terms) {
  const haystack = String(text ?? '').toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (term.length < 3) continue;
    if (haystack.includes(term)) hits += 1;
  }
  return hits;
}

/**
 * @param {{client: Object}} params
 */
export function createBase44KnowledgeStore({ client }) {
  const entity = client.entities.KnowledgeDocument;

  const store = {
    async storeDocument(doc) {
      if (!doc?.organization_id) throw new Error('KnowledgeDocument без organization_id');
      if (!SPACES.includes(doc.space)) throw new Error('KnowledgeDocument без корректного space');
      if (doc.space === 'case' && !doc.case_id) {
        throw new Error('Документ пространства дела обязан ссылаться на дело');
      }
      return entity.create(doc);
    },

    /**
     * Base44 не хранит векторы; ссылка на эмбеддинг сохраняется как внешний идентификатор.
     * Реализация на pgvector заменит этот метод на реальную запись вектора.
     */
    async storeEmbedding(docId, embedding) {
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Пустой эмбеддинг');
      }
      await entity.update(docId, { embedding_ref: `inline:${embedding.length}` });
    },

    /**
     * Лексический поиск по совпадению термов. Не является семантическим и честно
     * помечается как degraded: вызывающий код обязан учитывать, что полнота ниже.
     */
    async semanticSearch(query) {
      assertQuery(query);
      const filter = { organization_id: query.organizationId, space: query.space };
      if (query.caseId) filter.case_id = query.caseId;

      const docs = (await entity.filter(filter)) ?? [];
      const terms = String(query.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);

      return docs
        .filter((doc) => doc.organization_id === query.organizationId && doc.space === query.space)
        .map((doc) => ({
          ...doc,
          relevance_score: score(`${doc.title} ${doc.content}`, terms),
          retrieval_mode: 'lexical_degraded',
        }))
        .filter((doc) => doc.relevance_score > 0)
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, query.limit ?? 10);
    },

    async hybridSearch(query) {
      return store.semanticSearch(query);
    },

    /**
     * Удаление данных tenant (§60 ТЗ). Единственное место, где допускается физическое
     * удаление, и только по явному запросу владельца организации.
     */
    async deleteTenantData(organizationId) {
      if (!organizationId) throw new Error('deleteTenantData без organizationId');
      const docs = (await entity.filter({ organization_id: organizationId })) ?? [];
      let deleted = 0;
      for (const doc of docs) {
        await entity.delete(doc.id);
        deleted += 1;
      }
      return { deleted };
    },
  };

  assertImplements('KnowledgeStore', store, 'Base44KnowledgeStore');
  return store;
}
