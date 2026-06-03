import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildPayload } from '@/utils/payload';
import { useSaveMutation } from '@/hooks/useSaveMutation';
import { SAMPLING_SCHEDULE_FIELDS, SAMPLING_SCHEDULE_NUMBER_FIELDS } from '@/utils/entityFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, PlusCircle, MinusCircle } from 'lucide-react';
import { FREQ_TYPES } from '@/utils/labels';

const DEF_STAGE = { stage_number: 1, trigger_type: 'always', trigger_value: 0, frequency_type: 'days', frequency_value: 30, frequency_value_hours: 0 };
const DEF = { sampling_point_id: '', schedule_name: '', is_active: true, stages: [{ ...DEF_STAGE }], next_sample_due_date: '', next_sample_due_hours: '', current_stage: 1, samples_in_current_stage: 0, comments: '' };

const TRIGGER_LABELS = { always: 'Всегда (этот этап постоянный)', after_n_samples: 'После N проб переходит на следующий этап' };

export default function SamplingSchedules() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const qc = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({ queryKey: ['sampling-schedules'], queryFn: () => base44.entities.SamplingSchedule.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });

  const save = useSaveMutation({
    mutationFn: async (d) => {
      const payload = buildPayload(d, SAMPLING_SCHEDULE_FIELDS, SAMPLING_SCHEDULE_NUMBER_FIELDS);
      return d.id
        ? await base44.entities.SamplingSchedule.update(d.id, payload)
        : await base44.entities.SamplingSchedule.create(payload);
    },
    invalidateKeys: [['sampling-schedules']],
    onSuccess: () => {
      setOpen(false);
      setForm(DEF);
    },
  });
  const del = useMutation({
    mutationFn: id => base44.entities.SamplingSchedule.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sampling-schedules'] })
  });

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const getPoint = id => points.find(p => p.id === id);
  const getUnit = id => units.find(u => u.id === id);
  const getAsset = id => assets.find(a => a.id === id);

  const addStage = () => {
    const n = form.stages.length + 1;
    setForm(p => ({ ...p, stages: [...p.stages, { ...DEF_STAGE, stage_number: n }] }));
  };
  const removeStage = (idx) => setForm(p => ({ ...p, stages: p.stages.filter((_, i) => i !== idx) }));
  const updateStage = (idx, key, val) => setForm(p => ({
    ...p, stages: p.stages.map((s, i) => i === idx ? { ...s, [key]: val } : s)
  }));

  const describeStage = (s) => {
    const freq = `каждые ${s.frequency_value} ${FREQ_TYPES[s.frequency_type] || s.frequency_type}`;
    if (s.frequency_type === 'hours_or_days_first') return `${freq} / ${s.frequency_value_hours} м/ч (первое)`;
    return freq;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Графики отбора проб</h1>
          <p className="text-slate-500 text-sm mt-0.5">{schedules.length} графиков · многоэтапное планирование</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Создать график
        </Button>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <div className="text-center py-10 text-slate-400">Загрузка...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white rounded-lg border border-slate-200">Графики не созданы</div>
        ) : schedules.map(sch => {
          const pt = getPoint(sch.sampling_point_id);
          const unit = pt ? getUnit(pt.equipment_unit_id) : null;
          const asset = unit ? getAsset(unit.asset_id) : null;
          return (
            <div key={sch.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{sch.schedule_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sch.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {sch.is_active ? 'Активен' : 'Выключен'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {pt?.point_name || '—'} · {unit?.unit_name || '—'} · {asset?.asset_name || '—'}
                  </p>
                  {sch.next_sample_due_date && (
                    <p className="text-xs text-blue-600 mt-1">Следующая проба: {sch.next_sample_due_date}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(sch.stages || []).map((s, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                        {i + 1}. {describeStage(s)}
                        {s.trigger_type === 'after_n_samples' && ` → после ${s.trigger_value} проб`}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-3">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(sch); setOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить график?') && del.mutate(sch.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать график' : 'Создать график отбора'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[75vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Название графика *</Label>
                <Input value={form.schedule_name} onChange={e => f('schedule_name', e.target.value)} placeholder="Плановый мониторинг ГД" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Точка отбора</Label>
                <Select value={form.sampling_point_id} onValueChange={v => f('sampling_point_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Выберите точку отбора" /></SelectTrigger>
                  <SelectContent>{points.map(p => <SelectItem key={p.id} value={p.id}>{p.point_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Следующая проба (дата)</Label>
                <Input type="date" value={form.next_sample_due_date} onChange={e => f('next_sample_due_date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Следующая проба (м/ч)</Label>
                <Input type="number" value={form.next_sample_due_hours} onChange={e => f('next_sample_due_hours', +e.target.value)} />
              </div>
              <div className="flex items-center justify-between col-span-2 py-1">
                <Label>График активен</Label>
                <Switch checked={form.is_active} onCheckedChange={v => f('is_active', v)} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">Этапы графика</p>
                <Button type="button" variant="ghost" size="sm" onClick={addStage} className="gap-1 text-blue-600 text-xs">
                  <PlusCircle className="w-3.5 h-3.5" />Добавить этап
                </Button>
              </div>
              <div className="space-y-3">
                {form.stages.map((stage, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-600">Этап {idx + 1}</span>
                      {form.stages.length > 1 && (
                        <button onClick={() => removeStage(idx)} className="text-red-400 hover:text-red-600">
                          <MinusCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Тип этапа</Label>
                        <Select value={stage.trigger_type} onValueChange={v => updateStage(idx, 'trigger_type', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(TRIGGER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}><span className="text-xs">{v}</span></SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {stage.trigger_type === 'after_n_samples' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Количество проб на этапе</Label>
                          <Input type="number" className="h-8 text-sm" value={stage.trigger_value} onChange={e => updateStage(idx, 'trigger_value', +e.target.value)} />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs">Частота</Label>
                        <Select value={stage.frequency_type} onValueChange={v => updateStage(idx, 'frequency_type', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(FREQ_TYPES).map(([k, v]) => <SelectItem key={k} value={k}><span className="text-xs">Каждые N {v}</span></SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Значение N</Label>
                        <Input type="number" className="h-8 text-sm" value={stage.frequency_value} onChange={e => updateStage(idx, 'frequency_value', +e.target.value)} />
                      </div>
                      {stage.frequency_type === 'hours_or_days_first' && (
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs">Или каждые N моточасов (первое событие)</Label>
                          <Input type="number" className="h-8 text-sm" value={stage.frequency_value_hours} onChange={e => updateStage(idx, 'frequency_value_hours', +e.target.value)} />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-blue-600 mt-2">→ {describeStage(stage)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          {save.errorBlock}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.schedule_name || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
