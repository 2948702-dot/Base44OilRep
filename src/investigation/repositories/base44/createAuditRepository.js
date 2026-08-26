/**
 * Журнал аудита поверх Base44.
 *
 * Записи журнала не изменяются и не удаляются: RLS сущности AuditEvent закрывает
 * update и delete для всех ролей, включая system_admin.
 */

import { assertImplements } from '../contracts.js';

/**
 * @param {{client: Object, organizationId: string}} params
 */
export function createAuditRepository({ client, organizationId }) {
  if (!organizationId) throw new Error('Журнал аудита требует organizationId');
  const entity = client.entities.AuditEvent;

  const repository = {
    /**
     * Сбой записи журнала не отменяет уже выполненную операцию, но и не проходит молча:
     * ошибка поднимается наверх, чтобы сервис зафиксировал разрыв журнала.
     */
    async record(event) {
      return entity.create({ ...event, organization_id: organizationId });
    },

    async list(filter = {}) {
      const records = await entity.filter({ ...filter, organization_id: organizationId }, '-timestamp');
      return records ?? [];
    },
  };

  assertImplements('AuditRepository', repository, 'Base44AuditRepository');
  return repository;
}
