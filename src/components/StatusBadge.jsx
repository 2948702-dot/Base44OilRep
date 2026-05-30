import { cn } from '@/lib/utils';

const CONFIG = {
  green:    { label: 'Норма',     cls: 'bg-green-100 text-green-800 border-green-200' },
  yellow:   { label: 'Внимание',  cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  red:      { label: 'Критично',  cls: 'bg-red-100 text-red-800 border-red-200' },
  normal:   { label: 'Норма',     cls: 'bg-green-100 text-green-800 border-green-200' },
  due_soon: { label: 'Скоро',     cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  overdue:  { label: 'Просрочено',cls: 'bg-red-100 text-red-800 border-red-200' },
  active:   { label: 'Активен',   cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  closed:   { label: 'Закрыт',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending:      { label: 'Ожидает',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_analysis:  { label: 'В анализе', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  completed:    { label: 'Завершена', cls: 'bg-green-100 text-green-800 border-green-200' },
  cancelled:    { label: 'Отменена',  cls: 'bg-red-100 text-red-800 border-red-200' },
};

export default function StatusBadge({ status, label }) {
  const cfg = CONFIG[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', cfg.cls)}>
      {label || cfg.label}
    </span>
  );
}