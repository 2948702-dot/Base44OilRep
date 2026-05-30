import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Calculator } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';

function calcIndexes(r, oilRef) {
  const waterAct = r.water_activity ? Math.max(0, Math.min(100, 100 - (r.water_activity / 0.8) * 100)) : 100;
  const waterPpm = (r.water_ppm && oilRef?.lab_water_ppm)
    ? Math.max(0, Math.min(100, 100 - Math.abs(r.water_ppm - oilRef.lab_water_ppm) / (oilRef.lab_water_ppm || 100) * 200))
    : 100;
  const water_index = Math.round((waterAct + waterPpm) / 2);
  const wear_index = r.iron_mg_l ? Math.max(0, Math.min(100, 100 - (r.iron_mg_l / 100) * 100)) : 100;
  let viscosity_index_calc = 100;
  if (r.viscosity_40 && oilRef?.passport_viscosity_40) {
    const dev = Math.abs(r.viscosity_40 - oilRef.passport_viscosity_40) / oilRef.passport_viscosity_40;
    viscosity_index_calc = Math.max(0, Math.min(100, 100 - dev * 500));
  }
  let dielectric_index = 100;
  if (r.dielectric_constant && oilRef?.passport_dielectric) {
    const dev = Math.abs(r.dielectric_constant - oilRef.passport_dielectric) / oilRef.passport_dielectric;
    dielectric_index = Math.max(0, Math.min(100, 100 - dev * 300));
  }
  const oil_health_index = Math.round(water_index * 0.3 + wear_index * 0.3 + viscosity_index_calc * 0.25 + dielectric_index * 0.15);
  const overall_status = oil_health_index >= 70 ? 'green' : oil_health_index >= 40 ? 'yellow' : 'red';
  const recommendation_text = overall_status === 'green'
    ? 'Масло в хорошем состоянии. Следующий отбор по графику.'
    : overall_status === 'yellow'
      ? 'Состояние требует внимания. Рекомендуется увеличить частоту отбора.'
      : 'Критическое состояние. Требуется замена масла или диагностика оборудования.';
  return { ...r, water_index: Math.round(water_index), wear_index: Math.round(wear_index), viscosity_index_calc: Math.round(viscosity_index_calc), dielectric_index: Math.round(dielectric_index), oil_health_index, overall_status, recommendation_text };
}

const DEF = { sample_id: '', iron_mg_l: '', water_ppm: '', water_activity: '', viscosity_40: '', viscosity_100: '', density: '', dielectric_constant: '', recommendation_text: '' };

export default function AnalysisResults() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterSample, setFilterSample] = useState('');
  const qc = useQueryClient();

  const { data: results = [], isLoading } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });
  const { data: samples = [] } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.AnalysisResult.update(d.id, d) : base44.entities.AnalysisResult.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['analysis-results'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.AnalysisResult.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analysis-results'] })
  });

  const getSample = id => samples.find(s => s.id === id);
  const getOilForSample = (sampleId) => {
    const s = getSample(sampleId);
    if (!s) return null;
    const pt = points.find(p => p.id === s.sampling_point_id);
    return oils.find(o => o.id === (s.oil_type_id || pt?.oil_type_id));
  };

  const handleCalc = () => {
    const oilRef = getOilForSample(form.sample_id);
    setForm(prev => calcIndexes({ ...prev }, oilRef));
  };

  const filtered = results.filter(r => !filterSample || r.sample_id === filterSample);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const num = (k, v) => f(k, v === '' ? '' : +v);

  const ohiColor = (ohi) => {
    if (!ohi) return 'text-slate-400';
    if (ohi >= 70) return 'text-green-700 font-bold';
    if (ohi >= 40) return 'text-yellow-700 font-bold';
    return 'text-red-700 font-bold';
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Результаты анализа</h1>
          <p className="text-slate-500 text-sm mt-0.5">{results.length} записей</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>Ввести результат</Button>
      </div>

      <div className="mb-3">
        <Select value={filterSample} onValueChange={setFilterSample}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Все пробы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Все пробы</SelectItem>
            {samples.map(s => <SelectItem key={s.id} value={s.id}>{s.sample_number} · {s.sampling_date}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Проба</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Fe мг/л</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">H₂O ppm</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">aw</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Вязк. 40°C</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Плотность</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Диэл.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">OHI</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-slate-400">Результаты не найдены</td></tr>
            ) : filtered.map(r => {
              const s = getSample(r.sample_id);
              return (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{s?.sample_number || r.sample_id?.slice(0, 8)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.iron_mg_l ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.water_ppm ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.water_activity ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.viscosity_40 ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.density ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.dielectric_constant ?? '—'}</td>
                  <td className={`px-4 py-2.5 ${ohiColor(r.oil_health_index)}`}>{r.oil_health_index ?? '—'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.overall_status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(r); setOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить результат?') && del.mutate(r.id)}>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать результат' : 'Ввести результат анализа'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="col-span-3 space-y-1">
              <Label>Проба масла *</Label>
              <Select value={form.sample_id} onValueChange={v => f('sample_id', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите пробу" /></SelectTrigger>
                <SelectContent>{samples.map(s => <SelectItem key={s.id} value={s.id}>{s.sample_number} · {s.sampling_date}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-3 border-t pt-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Измеренные параметры</p>
            </div>
            <div className="space-y-1"><Label>Железо, мг/л</Label><Input type="number" step="0.01" value={form.iron_mg_l} onChange={e => num('iron_mg_l', e.target.value)} /></div>
            <div className="space-y-1"><Label>Вода раств., ppm</Label><Input type="number" step="0.1" value={form.water_ppm} onChange={e => num('water_ppm', e.target.value)} /></div>
            <div className="space-y-1"><Label>Активность воды (aw)</Label><Input type="number" step="0.001" min="0" max="1" value={form.water_activity} onChange={e => num('water_activity', e.target.value)} /></div>
            <div className="space-y-1"><Label>Вязкость при 40°C</Label><Input type="number" step="0.01" value={form.viscosity_40} onChange={e => num('viscosity_40', e.target.value)} /></div>
            <div className="space-y-1"><Label>Вязкость при 100°C</Label><Input type="number" step="0.01" value={form.viscosity_100} onChange={e => num('viscosity_100', e.target.value)} /></div>
            <div className="space-y-1"><Label>Плотность, кг/м³</Label><Input type="number" step="0.1" value={form.density} onChange={e => num('density', e.target.value)} /></div>
            <div className="space-y-1"><Label>Диэлектрич. постоянная</Label><Input type="number" step="0.01" value={form.dielectric_constant} onChange={e => num('dielectric_constant', e.target.value)} /></div>
            <div className="col-span-2 flex items-end">
              <Button type="button" variant="outline" onClick={handleCalc} className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                <Calculator className="w-4 h-4" />Рассчитать индексы
              </Button>
            </div>
            {form.oil_health_index !== undefined && form.oil_health_index !== '' && (
              <div className="col-span-3 bg-slate-50 rounded-lg p-3 grid grid-cols-5 gap-3 text-center text-sm">
                <div><p className="text-xs text-slate-500">Воды</p><p className="font-bold text-slate-800">{form.water_index ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Износ</p><p className="font-bold text-slate-800">{form.wear_index ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Вязкость</p><p className="font-bold text-slate-800">{form.viscosity_index_calc ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Диэлектр.</p><p className="font-bold text-slate-800">{form.dielectric_index ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">OHI</p><p className={`font-bold text-lg ${form.overall_status === 'green' ? 'text-green-600' : form.overall_status === 'yellow' ? 'text-yellow-600' : 'text-red-600'}`}>{form.oil_health_index}</p></div>
              </div>
            )}
            <div className="col-span-3 space-y-1">
              <Label>Рекомендация</Label>
              <Textarea value={form.recommendation_text} onChange={e => f('recommendation_text', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.sample_id || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}