import { AlertTriangle } from 'lucide-react';

export default function MaintenanceOverdueIndicator({ schedules }) {
  if (!schedules || schedules.length === 0) return null;

  const overdueCount = schedules.filter(s => s.status === 'overdue').length;
  const dueSoonCount = schedules.filter(s => s.status === 'due_soon').length;

  if (overdueCount === 0 && dueSoonCount === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
      {overdueCount > 0 && (
        <span className="text-red-600 font-semibold">{overdueCount} просроч.</span>
      )}
      {dueSoonCount > 0 && (
        <span className="text-yellow-600 font-semibold">{dueSoonCount} скоро</span>
      )}
    </div>
  );
}