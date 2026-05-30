import { useMemo } from 'react';
import { Activity, RefreshCw, Droplets, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

const INTERVALS_H = {
  main_engine: 1000, aux_engine: 500, generator: 500,
  hydraulic: 2000, gearbox: 2000, compressor: 1000, pump: 2000, other: 1000,
};

export default function LifecycleKPICards({ lifecycles, maintenanceEvents, points, units }) {
  const kpi = useMemo(() => {
    const active = lifecycles.filter(l => l.status === 'active');
    const closed = lifecycles.filter(l => l.status === 'closed' && l.start_operating_hours && l.end_operating_hours);

    // Avg lifecycle duration in hours
    const avgIntervalH = closed.length
      ? Math.round(closed.reduce((s, l) => s + (l.end_operating_hours - l.start_operating_hours), 0) / closed.length)
      : null;

    // Top-up volume and change volume from events
    const topupEvents = maintenanceEvents.filter(e => e.event_type === 'oil_topup');
    const changeEvents = maintenanceEvents.filter(e => e.event_type === 'oil_change');
    const totalTopupVol = topupEvents.reduce((s, e) => s + (e.added_oil_volume || 0), 0);
    const totalChangeVol = changeEvents.reduce((s, e) => s + (e.replaced_oil_volume || 0), 0);
    const topupRatio = totalChangeVol > 0 ? Math.round((totalTopupVol / totalChangeVol) * 100) : null;

    // Estimate hours remaining for active cycles
    const pointMap = Object.fromEntries(points.map(p => [p.id, p]));
    const unitMap = Object.fromEntries(units.map(u => [u.id, u]));

    let urgentCount = 0;
    let avgRemaining = null;
    const remainingArr = [];

    active.forEach(lc => {
      const pt = pointMap[lc.sampling_point_id];
      const unit = pt ? unitMap[pt.equipment_unit_id] : null;
      const typInterval = unit ? (INTERVALS_H[unit.equipment_type] || 1000) : 1000;
      const currentH = pt?.current_total_hours || lc.start_operating_hours || 0;
      const usedH = currentH - (lc.start_operating_hours || 0);
      const remainH = typInterval - usedH;
      if (remainH < typInterval * 0.2) urgentCount++;
      remainingArr.push(remainH);
    });

    if (remainingArr.length) {
      avgRemaining = Math.round(remainingArr.reduce((s, v) => s + v, 0) / remainingArr.length);
    }

    return {
      activeCount: active.length,
      closedCount: closed.length,
      avgIntervalH,
      topupRatio,
      totalTopupVol: Math.round(totalTopupVol),
      urgentCount,
      avgRemaining,
      changeCount: changeEvents.length,
    };
  }, [lifecycles, maintenanceEvents, points, units]);

  const cards = [
    {
      label: 'Активных циклов',
      value: kpi.activeCount,
      sub: `${kpi.closedCount} закрыто`,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Ср. межсервисный интервал',
      value: kpi.avgIntervalH != null ? `${kpi.avgIntervalH} м/ч` : '—',
      sub: `${kpi.changeCount} замен масла`,
      icon: RefreshCw,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: '% долива к объёму замен',
      value: kpi.topupRatio != null ? `${kpi.topupRatio}%` : '—',
      sub: `Долито всего ${kpi.totalTopupVol} л`,
      icon: Droplets,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Среднее остаток до замены',
      value: kpi.avgRemaining != null ? `${kpi.avgRemaining > 0 ? '+' : ''}${kpi.avgRemaining} м/ч` : '—',
      sub: kpi.urgentCount > 0 ? `⚠️ ${kpi.urgentCount} точек — <20% ресурса` : 'Все в норме',
      icon: kpi.urgentCount > 0 ? AlertTriangle : Clock,
      color: kpi.urgentCount > 0 ? 'text-amber-600' : 'text-slate-600',
      bg: kpi.urgentCount > 0 ? 'bg-amber-50' : 'bg-slate-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 flex gap-3 items-start">
            <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-4.5 h-4.5 ${c.color}`} size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 leading-tight mb-0.5">{c.label}</p>
              <p className={`text-lg font-bold leading-tight ${c.color}`}>{c.value}</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{c.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}