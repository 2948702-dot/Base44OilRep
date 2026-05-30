import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import ThresholdRangeBar from '@/components/ThresholdRangeBar';
import StepperInput from '@/components/StepperInput';
import { EQ_TYPES } from '@/utils/labels';

const PARAMS = ['iron_mg_l', 'water_activity', 'water_ppm', 'density', 'viscosity_40', 'viscosity_100', 'dielectric_constant'];

const PARAM_UNITS = {
  iron_mg_l:           'мг/л',
  water_activity:      '% (0–100)',
  water_ppm:           'ppm',
  density:             'кг/м³',
  viscosity_40:        'сСт (40°C)',
  viscosity_100:       'сСт (100°C)',
  dielectric_constant: '',
};

const PARAM_LABELS = {
  iron_mg_l:           'Железо',
  water_activity:      'Активная вода',
  water_ppm:           'Растворённая вода',
  density:             'Плотность',
  viscosity_40:        'Вязкость 40°C',
  viscosity_100:       'Вязкость 100°C',
  dielectric_constant: 'Диэлектрическая постоянная',
};

const PARAM_STEP = { dielectric_constant: '0.01', water_activity: '0.1' };

const UNIT_NAMES = ['ДВС', 'ГД', 'Редуктор', 'Рулевой привод', 'Вспом. двигатель', 'ГД Левый', 'ГД Правый', 'Генератор', 'Пресс', 'Прочее'];

const DEF = { oil_type_id: '', equipment_unit_id: '', equipment_type: 'all', parameter_name: '', green_min: '', green_max: '', yellow_min: '', yellow_max: '', red_min: '', red_max: '', unit: '', comments: '' };



export default function ThresholdRules() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterEq, setFilterEq] = useState('');
  const qc = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({ queryKey: ['threshold-rules'], queryFn: () => base44.entities.ThresholdRule.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.ThresholdRule.update(d.id, d) : base44.entities.ThresholdRule.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['threshold-rules'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.ThresholdRule.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threshold-rules'] })
  });

  const filtered = rules.filter(r => filterEq === 'none' || r.equipment_type === filterEq);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setParam = v => setForm(p => ({ ...p, parameter_name: v, unit: PARAM_UNITS[v] ?? '' }));

  const step = PARAM_STEP[form.parameter_name] || 'any';
  const isWaterActivity = form.parameter_name === 'water_activity';

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Пороговые правила</h1>
          <p className="text-slate-500 text-sm mt-0.5">{rules.length} правил · зелёный / жёлтый / красный диапазоны</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить правило
        </Button>
      </div>

      <div className="mb-3">
        <Select value={filterEq} onValueChange={setFilterEq}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Все типы оборудования" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все</SelectItem>
            <SelectItem value="all">Универсальный</SelectItem>
            {Object.entries(EQ_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Параметр</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип/Узел</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Ед. изм.</th>
              <th className="text-left px-4 py-2.5 font-medium text-green-700 text-xs">Зелёный (мин–макс)</th>
              <th className="text-left px-4 py-2.5 font-medium text-yellow-700 text-xs">Жёлтый (мин–макс)</th>
              <th className="text-left px-4 py-2.5 font-medium text-red-700 text-xs">Красный (мин–макс)</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Правила не найдены</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{PARAM_LABELS[r.parameter_name] || r.parameter_name}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {r.equipment_unit_id ? (
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                      {r.equipment_unit_id}
                    </span>
                  ) : (
                    <span>{r.equipment_type === 'all' ? 'Все типы' : EQ_TYPES[r.equipment_type] || r.equipment_type}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">
                  {r.parameter_name === 'dielectric_constant' ? 'б/р' : (PARAM_UNITS[r.parameter_name] || r.unit || '—')}
                </td>
                <td className="px-4 py-2.5" colSpan={3}>
                  <div className="space-y-1">
                    <ThresholdRangeBar compact
                      greenMin={r.green_min} greenMax={r.green_max}
                      yellowMin={r.yellow_min} yellowMax={r.yellow_max}
                      redMin={r.red_min} redMax={r.red_max}
                    />
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-700 font-medium">{r.green_min ?? '—'}–{r.green_max ?? '—'}</span>
                      <span className="text-yellow-700 font-medium">{r.yellow_min ?? '—'}–{r.yellow_max ?? '—'}</span>
                      <span className="text-red-700 font-medium">{r.red_min ?? '—'}–{r.red_max ?? '—'}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(r); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить правило?') && del.mutate(r.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать правило' : 'Добавить пороговое правило'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label>Параметр *</Label>
              <Select value={form.parameter_name} onValueChange={setParam}>
                <SelectTrigger><SelectValue placeholder="Параметр" /></SelectTrigger>
                <SelectContent>{PARAMS.map(p => <SelectItem key={p} value={p}>{PARAM_LABELS[p]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Тип оборудования</Label>
              <Select value={form.equipment_type} onValueChange={v => f('equipment_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все / Универсальный</SelectItem>
                  {Object.entries(EQ_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Единица измерения</Label>
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm text-slate-600">
                {form.parameter_name
                  ? (form.parameter_name === 'dielectric_constant' ? 'безразмерная (шаг 0.01)' : PARAM_UNITS[form.parameter_name])
                  : '— выберите параметр —'}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Единица оборудования (индивид.)</Label>
              <Select value={form.equipment_unit_id} onValueChange={v => f('equipment_unit_id', v)}>
                <SelectTrigger><SelectValue placeholder="Не установлено" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Не установлено</SelectItem>
                  {UNIT_NAMES.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Масло (необязательно)</Label>
              <Select value={form.oil_type_id} onValueChange={v => f('oil_type_id', v)}>
                <SelectTrigger><SelectValue placeholder="Все масла" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value={null}>Все масла</SelectItem>
                    {oils.map(o => <SelectItem key={o.id} value={o.id}>{o.oil_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Live range preview */}
            {(form.green_min !== '' || form.yellow_min !== '' || form.red_min !== '') && (
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-slate-500">Предпросмотр диапазонов</Label>
                <ThresholdRangeBar
                  greenMin={form.green_min} greenMax={form.green_max}
                  yellowMin={form.yellow_min} yellowMax={form.yellow_max}
                  redMin={form.red_min} redMax={form.red_max}
                />
              </div>
            )}
            <div className="col-span-2 grid grid-cols-3 gap-3 bg-green-50 rounded-lg p-3">
              <p className="col-span-3 text-xs font-semibold text-green-700 mb-1">🟢 Зелёный диапазон</p>
              <StepperInput label="Мин." value={form.green_min || 0} onChange={v => f('green_min', v)} min={0} max={isWaterActivity ? 100 : 1000} />
              <StepperInput label="Макс." value={form.green_max || 0} onChange={v => f('green_max', v)} min={0} max={isWaterActivity ? 100 : 1000} />
            </div>
            <div className="col-span-2 grid grid-cols-3 gap-3 bg-yellow-50 rounded-lg p-3">
              <p className="col-span-3 text-xs font-semibold text-yellow-700 mb-1">🟡 Жёлтый диапазон</p>
              <StepperInput label="Мин." value={form.yellow_min || 0} onChange={v => f('yellow_min', v)} min={0} max={isWaterActivity ? 100 : 1000} />
              <StepperInput label="Макс." value={form.yellow_max || 0} onChange={v => f('yellow_max', v)} min={0} max={isWaterActivity ? 100 : 1000} />
            </div>
            <div className="col-span-2 grid grid-cols-3 gap-3 bg-red-50 rounded-lg p-3">
              <p className="col-span-3 text-xs font-semibold text-red-700 mb-1">🔴 Красный диапазон</p>
              <StepperInput label="Мин." value={form.red_min || 0} onChange={v => f('red_min', v)} min={0} max={isWaterActivity ? 100 : 1000} />
              <StepperInput label="Макс." value={form.red_max || 0} onChange={v => f('red_max', v)} min={0} max={isWaterActivity ? 100 : 1000} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.parameter_name || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}