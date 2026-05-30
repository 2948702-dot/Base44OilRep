import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, PlusCircle, XCircle } from 'lucide-react';
import { FREQ_TYPES } from '@/utils/labels';

const DEF_STAGE = { stage_number: 1, trigger_type: 'always', trigger_value: 0, frequency_type: 'months', frequency_value: 1, frequency_value_hours: 0 };
const DEF = { sampling_point_id: '', schedule_name: '', is_active: true, stages: [{ ...DEF_STAGE }], next_sample_due_date: '', next_sample_due_hours: '', current_stage: 1, samples_in_current_stage: 0, comments: '' };

export default function SamplingSchedules() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const qc = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({ queryKey: ['sampling-schedules'], queryFn: () => base44.entities.SamplingSchedule.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.SamplingSchedule.update(d.id, d) : base44.entities.SamplingSchedule.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sampling-schedules'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.SamplingSchedule.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sampling-schedules'] })
  });

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const getPoint = id => points.find(p => p.id === id);
  const getPointLabel = (id) => {
    const pt = getPoint(id);
    if (!pt) return '—';
    const unit = units.find(u => u.id === pt.equipment_unit_id);
    const asset = assets.find(a => a.id === pt.asset_id);
    return `${pt.point_name}${unit ? ` · ${unit.unit_name}` : ''}${asset ? ` · ${asset.asset_name}` : ''}`;
  };

  const addStage = () => setForm(p => ({ ...p, stages: [...p.stages, { ...DEF_STAGE, stage_number: p.stages.length + 1 }] }));
  const removeStage = (i) => setForm(p => ({ ...p, stages: p.stages.filter((_, j) => j !== i).map((s, j) => ({ ...s, stage_number: j + 1 })) }));
  const updateStage = (i, k, v) => setForm(p => ({ ...p, stages: p.stages.map((s, j) => j === i ? { ...s, [k]: v } : s) }));

  const TRIGGER_LABELS = { always: 'Всегда (основной)', after_n_samples: 'После N проб' };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Графики отбора проб</h1>
          <p className="text-slate-500 text-sm mt-0.5">Настройка периодичности отбора для каждой точки</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Создать график
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Точка отбора</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Этапы</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Следующий отбор</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Активен</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
              : schedules.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">Графики не созданы</td></tr>
                : schedules.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{s.schedule_name}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{getPointLabel(s.sampling_point_id)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.stages?.length || 0} эт.</td>
                    <td className="px-4 py-2.5 text-slate-700">{s.next_sample_due_date || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.is_active ? 'Активен' : 'Отключён'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(s); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить график?') && del.mutate(s.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать график' : 'Создать график отбора'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1 max-h-[75vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Наименование *</Label>
                <Input value={form.schedule_name} onChange={e => f('schedule_name', e.target.value)} placeholder="После капремонта ГД" />
              </div>
              <div className="space-y-1">
                <Label>Точка отбора *</Label>
                <Select value={form.sampling_point_id} onValueChange={v => f('sampling_point_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Выберите точку" /></SelectTrigger>
                  <SelectContent>{points.map(p => <SelectItem key={p.id} value={p.id}>{p.point_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => f('is_active', v)} />
                <Label>График активен</Label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">Этапы периодичности</p>
                <Button type="button" variant="ghost" size="sm" onClick={addStage} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1">
                  <PlusCircle className="w-3.5 h-3.5" />Добавить этап
                </Button>
              </div>
              <div className="space-y-3">
                {form.stages?.map((stage, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-600 uppercase">Этап {stage.stage_number}</span>
                      {form.stages.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeStage(i)}>
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Условие запуска</Label>
                        <Select value={stage.trigger_type} onValueChange={v => updateStage(i, 'trigger_type', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(TRIGGER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {stage.trigger_type === 'after_n_samples' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Кол-во проб</Label>
                          <Input type="number" className="h-8 text-sm" value={stage.trigger_value} onChange={e => updateStage(i, 'trigger_value', +e.target.value)} />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs">Каждые</Label>
                        <Input type="number" className="h-8 text-sm" value={stage.frequency_value} onChange={e => updateStage(i, 'frequency_value', +e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Единица</Label>
                        <Select value={stage.frequency_type} onValueChange={v => updateStage(i, 'frequency_type', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(FREQ_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {stage.frequency_type === 'hours_or_days_first' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Моточасов</Label>
                          <Input type="number" className="h-8 text-sm" value={stage.frequency_value_hours} onChange={e => updateStage(i, 'frequency_value_hours', +e.target.value)} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Дата следующей пробы</Label>
                <Input type="date" value={form.next_sample_due_date} onChange={e => f('next_sample_due_date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>М/ч следующей пробы</Label>
                <Input type="number" value={form.next_sample_due_hours} onChange={e => f('next_sample_due_hours', +e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Комментарии</Label>
                <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.schedule_name || !form.sampling_point_id || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}