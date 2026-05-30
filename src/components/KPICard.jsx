const COLOR_MAP = {
  blue:   'bg-blue-50 text-blue-600',
  green:  'bg-green-50 text-green-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red:    'bg-red-50 text-red-600',
  slate:  'bg-slate-100 text-slate-600',
};

export default function KPICard({ title, value, subtitle, icon: Icon, color = 'blue', trend }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 font-medium truncate">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2 rounded-lg shrink-0 ${COLOR_MAP[color] || COLOR_MAP.blue}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-400">{trend}</p>
        </div>
      )}
    </div>
  );
}