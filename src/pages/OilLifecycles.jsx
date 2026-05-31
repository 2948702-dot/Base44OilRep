import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Play } from 'lucide-react';
import LifecycleChart from '@/components/LifecycleChart';
import LifecycleKPICards from '@/components/LifecycleKPICards';
import StatusBadge from '@/components/StatusBadge';

function Req() { return <span className="text-red-500 ml-0.5">*</span>; }

const DEF = { sampling_point_id: '', oil_type_id: '', start_date: '', start_operating_hours: '', end_date: '', end_operating_hours: '', status: 'active', start_reason: '', end_reason: '', comments: '' };

const clean = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === '' ? undefined : v]));

export default function OilLifecycles() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterAsset, setFilterAsset] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const qc = useQueryClient();

  const { data: lifecycles = [], isLoading } = useQuery({ queryKey: ['oil-lifecycles'], queryFn: () => base44.entities.OilLifecycle.list(undefined, 1000) });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list(undefined, 500) });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: maintenanceEvents = [] } = useQuery({ queryKey: ['maintenance-events'], queryFn: () => base44.entities.MaintenanceEvent.list(undefined, 2000) });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list(undefined, 500) });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });

  const handleSeed = async () => {
    if (!window.confirm('Сгенерировать реалистичные события ТО? Существующие события будут удалены и пересозданы.')) return;
    setSeeding(true); setSeedResult(null);
    const res = await base44.functions.invoke('seedMaintenanceEvents', {});
    setSeedResult(res.data);
    qc.invalidateQueries({ queryKey: ['maintenance-events'] });
    setSeeding(false);
  };

  // Enrich lifecycles with computed fields
  const enriched = useMemo(() => {
    const pointMap = Object.fromEntries(points.map(p => [p.id, p]));
    const unitMap = Object.fromEntries(units.map(u => [u.id, u]));
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));
    const INTERVALS_H = { main_engine: 1000, aux_engine: 500, generator: 500, hydraulic: 2000, gearbox: 2000, compressor: 1000, pump: 2000, other: 1000 };
    return lifecycles.map(l => {
      const pt = pointMap[l.sampling_point_id];
      const unit = pt ? unitMap[pt.equipment_unit_id] : null;
      const asset = pt ? assetMap[pt.asset_id] : null;
      const typInterval = unit ? (INTERVALS_H[unit.equipment_type] || 1000) : 1000;
      const currentH = unit?.current_total_hours ?? unit?.total_operating_hours ?? l.start_operating_hours ?? 0;
      const usedH = l.start_operating_hours != null ? currentH - l.start_operating_hours : null;
      const durationH = l.end_operating_hours && l.start_operating_hours ? l.end_operating_hours - l.start_operating_hours : usedH;
      const remainH = l.status === 'active' && usedH != null ? typInterval - usedH : null;
      const pctUsed = durationH != null ? Math.min(100, Math.round((durationH / typInterval) * 100)) : null;
      return { ...l, _pt: pt, _unit: unit, _asset: asset, _usedH: usedH, _durationH: durationH, _remainH: remainH, _pctUsed: pctUsed };
    });
  }, [lifecycles, points, units, assets]);

  const filtered = useMemo(() => enriched.filter(l =>
    (filterAsset === 'none' || l._asset?.id === filterAsset) &&
    (filterStatus === 'none' || l.status === filterStatus)
  ), [enriched, filterAsset, filterStatus]);

  const chartLCs = filterAsset || filterStatus ? filtered : lifecycles;

  const save = useMutation({
    mutationFn: d => { const c = clean(d); return c.id ? base44.entities.OilLifecycle.update(c.id, c) : base44.entities.OilLifecycle.create(c); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oil-lifecycles'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.OilLifecycle.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oil-lifecycles'] })
  });

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Жизненные циклы масла</h1>
          <p className="text-slate-500 text-sm mt-0.5">{lifecycles.length} записей · {maintenanceEvents.length} событий ТО</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSeed} disabled={seeding} className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50">
            <Play className="w-3.5 h-3.5" />{seeding ? 'Генерация...' : 'Сгенерировать данные'}
          </Button>
          <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />Новый цикл
          </Button>
        </div>
      </div>

      {seedResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${seedResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {seedResult.message || seedResult.error}
          {seedResult.breakdown && <span className="ml-2 text-xs opacity-70">(замены: {seedResult.breakdown.oil_change}, доливы: {seedResult.breakdown.oil_topup}, фильтры: {seedResult.breakdown.oil_filter})</span>}
        </div>
      )}

      <LifecycleKPICards
        lifecycles={lifecycles}
        maintenanceEvents={maintenanceEvents}
        points={points}
        units={units}
      />

      {lifecycles.length > 0 && (
        <div className="mb-5">
          <LifecycleChart
            lifecycles={chartLCs}
            maintenanceEvents={maintenanceEvents}
            points={points}
            oils={oils}
          />
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <Select value={filterAsset} onValueChange={setFilterAsset}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Все суда" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все суда</SelectItem>
            {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Все статусы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все статусы</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="closed">Закрытые</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400 self-center ml-auto">{filtered.length} из {lifecycles.length}</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Судно / Точка отбора</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Масло</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Начало</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наработка / Ресурс</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">% использован</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Остаток, м/ч</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Циклы не найдены</td></tr>
            ) : filtered.map(l => {
              const pctColor = l._pctUsed == null ? '' : l._pctUsed >= 90 ? 'bg-red-500' : l._pctUsed >= 70 ? 'bg-amber-400' : 'bg-emerald-500';
              const remainColor = l._remainH == null ? 'text-slate-400' : l._remainH < 0 ? 'text-red-600 font-semibold' : l._remainH < 200 ? 'text-amber-600 font-semibold' : 'text-slate-600';
              return (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900 text-xs">{l._asset?.asset_name || '—'}</div>
                    <div className="text-slate-400 text-xs">{l._pt?.point_name || getName([], l.sampling_point_id, 'point_name')}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[140px] truncate">{getName(oils, l.oil_type_id, 'oil_name')}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{l.start_date || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">
                    {l._durationH != null ? `${l._durationH} м/ч` : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {l._pctUsed != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pctColor}`} style={{ width: `${l._pctUsed}%` }} />
                        </div>
                        <span className="text-xs text-slate-600">{l._pctUsed}%</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-xs ${remainColor}`}>
                    {l.status === 'active' && l._remainH != null ? (
                      l._remainH < 0 ? `Просрочен ${Math.abs(l._remainH)} м/ч` : `${l._remainH} м/ч`
                    ) : l.status === 'closed' ? <span className="text-slate-300">закрыт</span> : '—'}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(l); setOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить цикл?') && del.mutate(l.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать цикл' : 'Новый жизненный цикл'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="col-span-2 space-y-1">
              <Label>Точка отбора <Req /></Label>
              <Select value={form.sampling_point_id} onValueChange={v => f('sampling_point_id', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите точку" /></SelectTrigger>
                <SelectContent>{points.map(p => <SelectItem key={p.id} value={p.id}>{p.point_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Тип масла <Req /></Label>
              <Select value={form.oil_type_id} onValueChange={v => f('oil_type_id', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите масло" /></SelectTrigger>
                <SelectContent>{oils.map(o => <SelectItem key={o.id} value={o.id}>{o.oil_name} — {o.manufacturer}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Дата начала <Req /></Label>
              <Input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч начало</Label>
              <Input type="number" value={form.start_operating_hours ?? ''} onChange={e => f('start_operating_hours', e.target.value === '' ? '' : +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Дата окончания</Label>
              <Input type="date" value={form.end_date} onChange={e => f('end_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч окончание</Label>
              <Input type="number" value={form.end_operating_hours ?? ''} onChange={e => f('end_operating_hours', e.target.value === '' ? '' : +e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Статус <Req /></Label>
              <Select value={form.status} onValueChange={v => f('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активный</SelectItem>
                  <SelectItem value="closed">Закрыт</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Причина начала</Label>
              <Input value={form.start_reason} onChange={e => f('start_reason', e.target.value)} placeholder="Плановая замена, ремонт..." />
            </div>
            <div className="space-y-1">
              <Label>Причина закрытия</Label>
              <Input value={form.end_reason} onChange={e => f('end_reason', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.sampling_point_id || !form.oil_type_id || !form.start_date || save.isPending}
            >
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}