/**
 * Запросы человеческого утверждения (§42 ТЗ).
 *
 * Approval — это состояние данных, а не подсказка в интерфейсе. Действие, требующее
 * утверждения, невозможно выполнить, пока нет approved-записи: проверка находится в
 * сервисах и инвариантах, а не в кнопке.
 */

import { APPROVAL_TYPE } from '../domain/enums.js';

export function createApprovalService({ repositories, scope }) {
  return {
    /**
     * @param {{approvalType: string, objectType: string, objectId?: string, payload?: Object}} input
     */
    async request(input) {
      if (!APPROVAL_TYPE.includes(input.approvalType)) {
        throw new Error(`Неизвестный тип утверждения: ${input.approvalType}`);
      }
      return repositories.approvals.create({
        approval_type: input.approvalType,
        object_type: input.objectType,
        object_id: input.objectId ?? null,
        requested_by: scope.actorId,
        requested_at: new Date().toISOString(),
        status: 'pending',
        payload: input.payload ?? null,
      });
    },

    /**
     * @param {string} approvalId
     * @param {'approved'|'rejected'} decision
     * @param {string} note
     */
    async decide(approvalId, decision, note) {
      if (!['approved', 'rejected'].includes(decision)) {
        throw new Error(`Недопустимое решение: ${decision}`);
      }
      if (!note) {
        throw new Error('Решение по запросу утверждения требует обоснования');
      }
      return repositories.approvals.update(approvalId, {
        status: decision,
        decided_by: scope.actorId,
        decided_at: new Date().toISOString(),
        decision_note: note,
      });
    },

    /**
     * Находит действующее утверждение нужного типа для объекта.
     *
     * @param {{approvalType: string, objectId?: string}} query
     * @returns {Promise<Object|null>}
     */
    async findApproved(query) {
      const filter = { approval_type: query.approvalType, status: 'approved' };
      if (query.objectId) filter.object_id = query.objectId;
      const found = await repositories.approvals.list(filter);
      return found[0] ?? null;
    },

    async listPending() {
      return repositories.approvals.list({ status: 'pending' });
    },
  };
}
