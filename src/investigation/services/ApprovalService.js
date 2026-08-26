/**
 * Запросы человеческого утверждения (§42 ТЗ).
 *
 * Approval — это состояние данных, а не подсказка в интерфейсе. Действие, требующее
 * утверждения, невозможно выполнить, пока нет approved-записи: проверка находится в
 * сервисах и инвариантах, а не в кнопке.
 */

import { APPROVAL_TYPE } from '../domain/enums.js';

/**
 * Требовать ли, чтобы решение принимал не тот, кто запросил утверждение.
 *
 * По умолчанию выключено: в организации из одного следователя это остановило бы работу
 * совсем. Там, где разделение обязанностей — требование регламента, оно включается
 * настройкой развёртывания и начинает действовать в коде, а не в инструкции.
 */
const REQUIRE_SEPARATE_APPROVER = process.env.REQUIRE_SEPARATE_APPROVER === '1';

export function createApprovalService({ repositories, scope, requireSeparateApprover }) {
  const separateApprover = requireSeparateApprover ?? REQUIRE_SEPARATE_APPROVER;

  return {
    /**
     * @param {{approvalType: string, objectType: string, objectId?: string,
     *   requestedBy?: string, payload?: Object}} input
     */
    async request(input) {
      if (!APPROVAL_TYPE.includes(input.approvalType)) {
        throw new Error(`Неизвестный тип утверждения: ${input.approvalType}`);
      }
      return repositories.approvals.create({
        approval_type: input.approvalType,
        object_type: input.objectType,
        object_id: input.objectId ?? null,
        // Запрашивающим записывается тот, чьё предложение утверждается. Для вывода,
        // предложенного агентом, это агент: иначе журнал показывал бы, что человек
        // утвердил собственное предложение, хотя предложил его не он.
        requested_by: input.requestedBy ?? scope.actorId,
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
      if (scope.actorType && scope.actorType !== 'user') {
        throw new Error(
          'Решение по запросу утверждения принимает человек: смысл §42 в том, что агент '
          + 'не утверждает сам себя',
        );
      }

      const existing = await repositories.approvals.get(approvalId);
      if (!existing) throw new Error(`Запрос утверждения ${approvalId} не найден`);
      if (existing.status !== 'pending') {
        throw new Error(
          `Запрос утверждения ${approvalId} уже решён (${existing.status}): переутверждение `
          + 'скрыло бы, кто и когда принял первое решение',
        );
      }
      if (separateApprover && existing.requested_by === scope.actorId) {
        throw new Error(
          'Разделение обязанностей: решение по запросу принимает не тот, кто его создал',
        );
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
