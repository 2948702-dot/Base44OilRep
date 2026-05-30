import { useMemo } from 'react';
import { EVENT_TYPES } from '@/utils/labels';

const TYPE_COLORS = {
  oil_change: '#3b82f6',
  oil_topup: '#10b981',
  oil_filter: '#f59e0b',
  air_filter: '#8b5cf6',
  repair: '#ef4444',
  component_replacement: '#f97316',
  other: '#6b7280',
};

const LC_COLORS = ['#0ea5e9','#8b5cf6','#f59e0b','#10b981','#f97316','#ec4899'];

export default function LifecycleChart({ lifecycles, maintenanceEvents, points, oils }) {
  const { minDate, maxDate, range } = useMemo(() => {
    const allDates = [
      ...lifecycles.map(l => l.start_date).filter(Boolean),
      ...lifecycles.map(l => l.end_date).filter(Boolean),
      ...maintenanceEvents.map(e => e.event_date).filter(Boolean),
    ].map(d => new Date(d).getTime());
    if (!allDates.length) return { minDate: Date.now(), maxDate: Date.now(), range: 1 };
    const minDate = Math.min(...allDates);
    const maxDate = Math.max(...allDates, Date.now());
    return { minDate, maxDate, range: maxDate - minDate || 1 };
  }, [lifecycles, maintenanceEvents]);

  const groupedByPoint = useMemo(() => {
    const map = {};
    lifecycles.forEach(lc => {
      if (!map[lc.sampling_point_id]) map[lc.sampling_point_id] = [];
      map[lc.sampling_point_id].push(lc);
    });
    return map;
  }, [lifecycles]);

  const axisLabels = useMemo(() => {
    const labels = [];
    const start = new Date(minDate);
    start.setDate(1);
    const end = new Date(maxDate);
    let cur = new Date(start);
    while (cur <= end) {
      const pct = ((cur.getTime() - minDate) / range) * 100;
      labels.push({ label: `${cur.getMonth() + 1}/${cur.getFullYear().toString().slice(2)}`, pct });
      cur.setMonth(cur.getMonth() + 3);
    }
    return labels;
  }, [minDate, maxDate, range]);

  const toPercent = (dateStr) => {
    if (!dateStr) return null;
    return ((new Date(dateStr).getTime() - minDate) / range) * 100;
  };

  const pointIds = Object.keys(groupedByPoint);

  if (!pointIds.length) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">Нет данных для отображения графика</div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">График жизненных циклов и событий ТО</h2>

      <div className="flex flex-wrap gap-3 mb-4 text-xs text-slate-600">
        {Object.entries(TYPE_COLORS).map(([k, color]) => (
          <div key={k} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            {EVENT_TYPES[k]}
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {pointIds.map(pointId => {
          const point = points.find(p => p.id === pointId);
          const lcs = groupedByPoint[pointId];
          const pointEvents = maintenanceEvents.filter(e => e.sampling_point_id === pointId);

          return (
            <div key={pointId} className="flex items-center gap-3">
              <div className="text-xs text-slate-600 font-medium w-28 shrink-0 text-right truncate">
                {point?.point_name || '—'}
              </div>
              <div className="relative flex-1 h-8 bg-slate-100 rounded-md">
                {lcs.map((lc, idx) => {
                  const left = toPercent(lc.start_date) ?? 0;
                  const right = lc.end_date ? toPercent(lc.end_date) : 100;
                  const width = Math.max(right - left, 0.5);
                  const oil = oils.find(o => o.id === lc.oil_type_id);
                  const color = LC_COLORS[idx % LC_COLORS.length];
                  return (
                    <div
                      key={lc.id}
                      className="absolute top-1 bottom-1 rounded flex items-center px-1.5 overflow-hidden"
                      style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: 0.85 }}
                      title={`${oil?.oil_name || 'Масло'} | ${lc.start_date} → ${lc.end_date || 'сейчас'}`}
                    >
                      <span className="text-white text-xs truncate leading-none">{oil?.oil_name}</span>
                    </div>
                  );
                })}
                {pointEvents.map(ev => {
                  const pct = toPercent(ev.event_date);
                  if (pct === null) return null;
                  const color = TYPE_COLORS[ev.event_type] || '#6b7280';
                  return (
                    <div
                      key={ev.id}
                      className="absolute top-0 bottom-0 flex items-center justify-center z-10"
                      style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                      title={`${EVENT_TYPES[ev.event_type]} | ${ev.event_date}`}
                    >
                      <div className="w-3 h-3 rounded-full border-2 border-white shadow-sm" style={{ background: color }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex ml-[7.5rem] relative mt-1.5">
        <div className="flex-1 relative h-4">
          {axisLabels.map((l, i) => (
            <span
              key={i}
              className="absolute text-xs text-slate-400 transform -translate-x-1/2"
              style={{ left: `${l.pct}%` }}
            >
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}