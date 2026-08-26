/**
 * Журнал аудита в PostgreSQL.
 *
 * Неизменяемость обеспечена триггером базы, а не дисциплиной приложения: попытка
 * update или delete по audit_event поднимает исключение независимо от того, кто её
 * выполняет — код, администратор или ошибочная миграция.
 */

import { assertImplements } from '../contracts.js';
import { query } from './pool.js';

/** Колонки журнала, по которым разрешено фильтровать. */
const FILTERABLE_COLUMNS = new Set([
  'case_id', 'actor', 'actor_type', 'object_type', 'object_id', 'operation',
]);

export function createAuditRepository({ db, organizationId }) {
  if (!organizationId) throw new Error('Журнал аудита требует organizationId');

  const repository = {
    async record(event) {
      const payload = {
        organization_id: organizationId,
        case_id: event.case_id ?? null,
        actor: event.actor ?? null,
        actor_type: event.actor_type,
        timestamp: event.timestamp ?? new Date().toISOString(),
        object_type: event.object_type,
        object_id: event.object_id ?? null,
        operation: event.operation,
        old_value: event.old_value ?? null,
        new_value: event.new_value ?? null,
        reason: event.reason ?? null,
        ip: event.ip ?? null,
        device: event.device ?? null,
      };
      const keys = Object.keys(payload);
      const result = await query(
        db,
        `insert into audit_event (${keys.join(', ')})
         values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
        Object.values(payload).map((value) => (
          value !== null && typeof value === 'object' ? JSON.stringify(value) : value
        )),
      );
      return result.rows[0];
    },

    async list(filter = {}) {
      const conditions = ['organization_id = $1'];
      const params = [organizationId];
      for (const [key, value] of Object.entries(filter)) {
        // Имя колонки приходит из вызывающего кода и попадает в текст запроса.
        // Единственная точка слоя хранения, где это так, — поэтому здесь стоит
        // белый список, а не доверие к тому, что все вызовы сегодня литеральные.
        if (!FILTERABLE_COLUMNS.has(key) || value === undefined) continue;
        params.push(value);
        conditions.push(`${key} = $${params.length}`);
      }
      const result = await query(
        db,
        `select * from audit_event where ${conditions.join(' and ')} order by timestamp desc limit 500`,
        params,
      );
      return result.rows;
    },
  };

  assertImplements('AuditRepository', repository, 'PostgresAuditRepository');
  return repository;
}
