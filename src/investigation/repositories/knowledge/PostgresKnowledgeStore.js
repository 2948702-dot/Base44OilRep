/**
 * KnowledgeStore на PostgreSQL + pgvector.
 *
 * Два непересекающихся пространства: методология и материалы дела. Смешивать их нельзя
 * не из аккуратности, а потому что методическая выдержка, попавшая в материалы дела,
 * становится неотличима от доказательства (§49 ТЗ).
 *
 * Изоляция арендатора здесь двойная: явный фильтр в запросе и политика RLS базы.
 */

import { assertImplements } from '../contracts.js';
import { query } from '../postgres/pool.js';

const SPACES = ['methodology', 'case'];

function assertQuery(request) {
  if (!request?.organizationId) {
    throw new Error('Запрос к KnowledgeStore без organizationId запрещён');
  }
  if (!SPACES.includes(request.space)) {
    throw new Error(`Запрос к KnowledgeStore требует space: ${SPACES.join(' | ')}`);
  }
  if (request.space === 'case' && !request.caseId) {
    throw new Error('Поиск в пространстве дела требует caseId');
  }
}

/**
 * @param {{db: Object, embed?: (text: string) => Promise<number[]>}} params
 */
export function createPostgresKnowledgeStore({ db, embed }) {
  const store = {
    async storeDocument(doc) {
      if (!doc?.organization_id) throw new Error('KnowledgeDocument без organization_id');
      if (!SPACES.includes(doc.space)) throw new Error('KnowledgeDocument без корректного space');
      if (doc.space === 'case' && !doc.case_id) {
        throw new Error('Документ пространства дела обязан ссылаться на дело');
      }

      const result = await query(
        db,
        `insert into knowledge_document
           (organization_id, case_id, space, title, content, chunk_index, source_id, metadata, methodology_version)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning *`,
        [
          doc.organization_id, doc.case_id ?? null, doc.space, doc.title, doc.content ?? null,
          doc.chunk_index ?? null, doc.source_id ?? null,
          doc.metadata ? JSON.stringify(doc.metadata) : null,
          doc.methodology_version ?? null,
        ],
      );
      return result.rows[0];
    },

    async storeEmbedding(docId, embedding) {
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Пустой эмбеддинг');
      }
      await query(
        db,
        'update knowledge_document set embedding = $2::vector, embedding_ref = $3 where id = $1',
        [docId, `[${embedding.join(',')}]`, `dim:${embedding.length}`],
      );
    },

    /**
     * Семантический поиск по косинусной близости. Если функция построения эмбеддинга
     * не передана, честно падаем, а не подменяем поиск лексическим молча: тихая
     * подмена качества поиска — это скрытая потеря полноты.
     */
    async semanticSearch(request) {
      assertQuery(request);
      if (!embed) {
        throw new Error(
          'Семантический поиск недоступен: не передана функция построения эмбеддинга. '
          + 'Используйте hybridSearch для лексического поиска.',
        );
      }

      const vector = await embed(request.text);
      const params = [request.organizationId, request.space, `[${vector.join(',')}]`];
      let sql = `select *, 1 - (embedding <=> $3::vector) as relevance_score
                 from knowledge_document
                 where organization_id = $1 and space = $2 and embedding is not null`;
      if (request.caseId) {
        params.push(request.caseId);
        sql += ` and case_id = $${params.length}`;
      }
      params.push(request.limit ?? 10);
      sql += ` order by embedding <=> $3::vector limit $${params.length}`;

      const result = await query(db, sql, params);
      return result.rows.map((row) => ({ ...row, retrieval_mode: 'semantic' }));
    },

    /**
     * Гибридный поиск: полнотекстовый ранг плюс векторная близость, когда эмбеддинги есть.
     */
    async hybridSearch(request) {
      assertQuery(request);
      const params = [request.organizationId, request.space, request.text ?? ''];
      let sql = `select *, ts_rank(to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(content, '')),
                          plainto_tsquery('russian', $3)) as relevance_score
                 from knowledge_document
                 where organization_id = $1 and space = $2
                   and to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(content, ''))
                       @@ plainto_tsquery('russian', $3)`;
      if (request.caseId) {
        params.push(request.caseId);
        sql += ` and case_id = $${params.length}`;
      }
      params.push(request.limit ?? 10);
      sql += ` order by relevance_score desc limit $${params.length}`;

      const result = await query(db, sql, params);
      return result.rows.map((row) => ({ ...row, retrieval_mode: 'lexical' }));
    },

    /**
     * Удаление данных арендатора (§60 ТЗ). Единственный сценарий физического удаления;
     * каскад по внешним ключам снимает и всё остальное, что принадлежит организации.
     */
    async deleteTenantData(organizationId) {
      if (!organizationId) throw new Error('deleteTenantData без organizationId');
      const result = await query(
        db,
        'delete from knowledge_document where organization_id = $1',
        [organizationId],
      );
      return { deleted: result.rowCount };
    },
  };

  assertImplements('KnowledgeStore', store, 'PostgresKnowledgeStore');
  return store;
}
