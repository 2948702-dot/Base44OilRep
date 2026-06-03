import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Обёртка над useMutation для форм сохранения.
 * Возвращает mutate, isPending, isError, error, errorBlock (готовый JSX для отображения ошибки),
 * и автоматически инвалидирует указанные queryKeys при успехе.
 *
 * @param {Object} config
 * @param {Function} config.mutationFn — функция, выполняющая сохранение
 * @param {Array<Array<string>>} config.invalidateKeys — список queryKey для инвалидации
 * @param {Function} config.onSuccess — дополнительный callback при успехе
 */
export function useSaveMutation({ mutationFn, invalidateKeys = [], onSuccess }) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: async (data) => {
      for (const key of invalidateKeys) {
        await qc.invalidateQueries({ queryKey: key });
      }
      if (onSuccess) {
        await onSuccess(data);
      }
    },
  });

  const errorBlock = mutation.isError ? (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      Ошибка сохранения: {mutation.error?.message || 'Base44 не принял изменения'}
    </div>
  ) : null;

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    errorBlock,
    reset: mutation.reset,
  };
}
