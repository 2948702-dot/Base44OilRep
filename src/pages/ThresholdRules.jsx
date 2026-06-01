import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Palette } from 'lucide-react';
import ThresholdRangeBar from '@/components/ThresholdRangeBar';
import StepperInput from '@/components/StepperInput';
import { EQ_TYPES } from '@/utils/labels';

const PARAMS = ['iron_mg_l', 'water_activity', 'water_ppm', 'density', 'viscosity_40', 'dielectric_constant'];

const NONE_VALUE = '__none__';

const OPTIONAL_STRING_FIELDS = ['client_id', 'asset_id', 'equipment_unit_id', 'sampling_point_id', 'oil_type_id', 'unit', 'comments'];
const NUMBER_FIELDS = [
  'green_min', 'green_max', 'yellow_min', 'yellow_max', 'red_min', 'red_max',
  'base_value', 'green_left_pct', 'green_right_pct', 'yellow_left_pct', 'yellow_right_pct',
  'red_left_pct', 'red_right_pct',
];

function toOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function cleanThresholdRulePayload(raw) {
  const data = { ...raw };
  OPTIONAL_STRING_FIELDS.forEach((field) => {
    if (data[field] === '' || data[field] === null || data[field] === NONE_VALUE) {
      delete data[field];
    }
  });
  NUMBER_FIELDS.forEach((field) => {
    const value = toOptionalNumber(data[field]);
    if (value === undefined) {
      delete data[field];
    } else {
      data[field] = value;
    }
  });
  return data;
}

const PARAM_UNITS = {
  iron_mg_l:           'мг/л',
  water_activity:      '% (0–100)',
  water_ppm:           'ppm',
  density:             'кг/м³',
  viscosity_40:        'сСт (40°C)',
  dielectric_constant: '',
};

const PARAM_LABELS = {
  iron_mg_l:           'Железо',
  water_activity:      'Активная вода',
  water_ppm:           'Растворённая вода',
  density:             'Плотность',
  viscosity_40:        'Вязкость 40°C',
  dielectric_constant: 'Диэлектрическая постоянная',
};

const UNIT_NAMES = ['ДВС', 'ГД', 'Редуктор', 'Рулевой привод', 'Вспом. двигатель', 'ГД Левый', 'ГД Правый', 'Генератор', 'Пресс', 'Прочее'];

const PRESET_COLORS = ['#dc2626', '#f97316', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#9333ea', '#64748b'];

const DEF_RANGE = { min: '', max: '', color: '#16a34a', label: '' };

const DEF = {
  oil_type_id: '', equipment_unit_id: '', equipment_type: 'all', parameter_name: '',
  green_min: '', green_max: '', yellow_min: '', yellow_max: '', red_min: '', red_max: '',
  unit: '', comments: '', deviation_mode: false, base_value: '',
  green_left_pct: '', green_right_pct: '', yellow_left_pct: '', yellow_right_pct: '', red_left_pct: '', red_right_pct: '',
  custom_ranges_mode: false,
  ranges: [{ ...DEF_RANGE }],
};

function calcDeviationZones(base, gl, gr, yl, yr, rl, rr) {
  const b = parseFloat(base);
  if (!b) return {};
  const pct = (v) => parseFloat(v) || 0;
  return {
    green_min:  parseFloat((b * (1 - pct(gl) / 100)).toFixed(4)),
    green_max:  parseFloat((b * (1 + pct(gr) / 100)).toFixed(4)),
    yellow_min: parseFloat((b * (1 - pct(yl) / 100)).toFixed(4)),
    yellow_max: parseFloat((b * (1 + pct(yr) / 100)).toFixed(4)),
    red_min:    parseFloat((b * (1 - pct(rl) / 100)).toFixed(4)),
    red_max:    parseFloat((b * (1 + pct(rr) / 100)).toFixed(4)),
  };
}

export default function ThresholdRules() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterEq, setFilterEq] = useState('none');
  const [selected, setSelected] = useState(new Set());
  const qc = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({ queryKey: ['threshold-rules'], queryFn: () => base44.entities.ThresholdRule.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });

  const save = useMutation({
    mutationFn: d => {
      const { id, ...payload } = d;
      return id ? base44.entities.ThresholdRule.update(id, payload) : base44.entities.ThresholdRule.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['threshold-rules'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.ThresholdRule.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threshold-rules'] })
  });
  const bulkDel = useMutation({
    mutationFn: async (ids) => { for (const id of ids) await base44.entities.ThresholdRule.delete(id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['threshold-rules'] }); setSelected(new Set()); }
  });
  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(x => x.id)));

  const filtered = filterEq === 'none' ? rules : rules.filter(r => r.equipment_type === filterEq);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setParam = v => setForm(p => ({ ...p, parameter_name: v, unit: PARAM_UNITS[v] ?? '' }));

  const isWaterActivity = form.parameter_name === 'water_activity';
  const devZones = form.deviation_mode
    ? calcDeviationZones(form.base_value, form.green_left_pct, form.green_right_pct, form.yellow_left_pct, form.yellow_right_pct, form.red_left_pct, form.red_right_pct)
    : {};

  const addRange = () => setForm(p => ({ ...p, ranges: [...(p.ranges || []), { ...DEF_RANGE }] }));
  const removeRange = i => setForm(p => ({ ...p, ranges: p.ranges.filter((_, idx) => idx !== i) }));
  const updateRange = (i, key, val) => setForm(p => ({ ...p, ranges: p.ranges.map((r, idx) => idx === i ? { ...r, [key]: val } : r) }));

  const handleSave = () => {
    let data = form.deviation_mode ? { ...form, ...devZones } : { ...form };
    if (!data.equipment_type) data.equipment_type = 'all';
    if (!data.custom_ranges_mode) {
      // strip ranges with empty min/max to avoid validation errors
      data.ranges = [];
    } else {
      // parse numbers in ranges
      data.ranges = (data.ranges || []).map(r => ({
        ...r,
        min: r.min !== '' ? parseFloat(r.min) : undefined,
        max: r.max !== '' ? parseFloat(r.max) : undefined,
      })).filter(r => r.min !== undefined && r.max !== undefined);
    }
    save.mutate(cleanThresholdRulePayload(data));
  };

  const setMode = (mode) => {
    if (mode === 'absolute') setForm(p => ({ ...p, deviation_mode: false, custom_ranges_mode: false }));
    if (mode === 'deviation') setForm(p => ({ ...p, deviation_mode: true, custom_ranges_mode: false }));
    if (mode === 'custom') setForm(p => ({ ...p, deviation_mode: false, custom_ranges_mode: true }));
  };

  const currentMode = form.custom_ranges_mode ? 'custom' : form.deviation_mode ? 'deviation' : 'absolute';

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Пороговые правила</h1>
          <p className="text-slate-500 text-sm mt-0.5">{rules.length} правил</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={() => window.confirm(`Удалить ${selected.size} правил?`) && bulkDel.mutate([...selected])} disabled={bulkDel.isPending}>
              <Trash2 className="w-4 h-4 mr-1.5" />Удалить выбранные ({selected.size})
            </Button>
          )}
          <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />Добавить правило
          </Button>
        </div>
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
              <th className="w-8 px-3 py-2.5"><input type="checkbox" className="w-4 h-4 cursor-pointer" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} /></th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Параметр</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип<br/>обор.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Ед.<br/>обор.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Масло</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Ед.<br/>изм.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Диапазоны</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Правила не найдены</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50 ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-2.5"><input type="checkbox" className="w-4 h-4 cursor-pointer" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-4 py-2.5">
                  <button className="font-medium text-slate-900 hover:text-blue-600 hover:underline text-left" onClick={() => { setForm({ ...DEF, ...r, equipment_type: r.equipment_type || 'all', ranges: r.ranges || [{ ...DEF_RANGE }] }); setOpen(true); }}>
                    {PARAM_LABELS[r.parameter_name] || r.parameter_name}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">
                  {r.equipment_type === 'all' ? <span className="text-slate-400">Все типы</span> : <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{EQ_TYPES[r.equipment_type] || r.equipment_type}</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">
                  {r.equipment_unit_id ? <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium max-w-[90px] truncate block" title={r.equipment_unit_id}>{r.equipment_unit_id}</span> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">
                  {r.oil_type_id ? <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">{oils.find(o => o.id === r.oil_type_id)?.oil_name || '—'}</span> : <span className="text-slate-400">Все масла</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">
                  {r.parameter_name === 'dielectric_constant' ? 'б/р' : (PARAM_UNITS[r.parameter_name] || r.unit || '—')}
                </td>
                <td className="px-4 py-2.5">
                  <div className="space-y-1 min-w-[180px]">
                    {r.custom_ranges_mode && r.ranges?.length > 0 ? (
                      <>
                        <ThresholdRangeBar compact showLabels ranges={r.ranges} />
                        <div className="hidden">
                          {r.ranges.map((seg, i) => (
                            <span key={i} className="flex items-center gap-1 text-xs font-medium" style={{ color: seg.color }}>
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: seg.color }} />
                              {seg.min}–{seg.max}{seg.label ? ` (${seg.label})` : ''}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <ThresholdRangeBar compact showLabels
                          greenMin={r.green_min} greenMax={r.green_max}
                          yellowMin={r.yellow_min} yellowMax={r.yellow_max}
                          redMin={r.red_min} redMax={r.red_max}
                        />
                        <div className="hidden">
                          <span className="text-green-700 font-medium">{r.green_min ?? '—'}–{r.green_max ?? '—'}</span>
                          <span className="text-yellow-700 font-medium">{r.yellow_min ?? '—'}–{r.yellow_max ?? '—'}</span>
                          <span className="text-red-700 font-medium">{r.red_min ?? '—'}–{r.red_max ?? '—'}</span>
                        </div>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm({ ...DEF, ...r, ranges: r.ranges || [{ ...DEF_RANGE }] }); setOpen(true); }}>
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

            {/* Mode selector */}
            <div className="col-span-2 bg-slate-50 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-slate-500 mb-2">Режим ввода диапазонов</p>
              <div className="flex gap-2">
                {[
                  { key: 'absolute', label: 'Абсолютные значения' },
                  { key: 'deviation', label: 'Отклонение от базы (%)' },
                  { key: 'custom', label: '🎨 Произвольные диапазоны' },
                ].map(m => (
                  <button key={m.key} onClick={() => setMode(m.key)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                      currentMode === m.key
                        ? 'bg-white border-slate-800 text-slate-900 shadow-sm'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white'
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Common fields */}
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
              <Select value={form.equipment_unit_id || NONE_VALUE} onValueChange={v => f('equipment_unit_id', v === NONE_VALUE ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Не установлено" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Не установлено</SelectItem>
                  {UNIT_NAMES.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Масло (необязательно)</Label>
              <Select value={form.oil_type_id || NONE_VALUE} onValueChange={v => f('oil_type_id', v === NONE_VALUE ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Все масла" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Все масла</SelectItem>
                  {oils.map(o => <SelectItem key={o.id} value={o.id}>{o.oil_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* ---- CUSTOM RANGES MODE ---- */}
            {currentMode === 'custom' && (
              <div className="col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Palette className="w-4 h-4" /> Диапазоны
                  </Label>
                  <Button size="sm" variant="outline" onClick={addRange}>
                    <Plus className="w-3.5 h-3.5 mr-1" />Добавить
                  </Button>
                </div>

                {(form.ranges || []).map((seg, i) => (
                  <div key={i} className="flex gap-3 items-start bg-slate-50 rounded-lg p-3 border border-slate-200">
                    {/* Color picker */}
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <span className="text-xs text-slate-400">Цвет</span>
                      <div className="relative w-9 h-9">
                        <input
                          type="color"
                          value={seg.color || '#16a34a'}
                          onChange={e => updateRange(i, 'color', e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="w-9 h-9 rounded-lg border-2 border-white shadow-md cursor-pointer" style={{ backgroundColor: seg.color || '#16a34a' }} />
                      </div>
                      <div className="flex flex-wrap gap-0.5 w-20">
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => updateRange(i, 'color', c)}
                            className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${seg.color === c ? 'border-slate-800 scale-110' : 'border-white shadow-sm'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Range inputs */}
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">От</Label>
                        <Input type="number" step="any" value={seg.min} onChange={e => updateRange(i, 'min', e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">До</Label>
                        <Input type="number" step="any" value={seg.max} onChange={e => updateRange(i, 'max', e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Метка</Label>
                        <Input value={seg.label || ''} onChange={e => updateRange(i, 'label', e.target.value)} placeholder="норма" />
                      </div>
                    </div>

                    <button onClick={() => removeRange(i)} className="text-red-400 hover:text-red-600 mt-6 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Preview */}
                {(form.ranges || []).some(r => r.min !== '' && r.max !== '') && (
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Предпросмотр</Label>
                    <ThresholdRangeBar ranges={form.ranges} showLabels />
                    <div className="hidden">
                      {(form.ranges || []).filter(r => r.min !== '' && r.max !== '').map((r, i) => (
                        <span key={i} className="flex items-center gap-1 text-xs font-medium" style={{ color: r.color }}>
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: r.color }} />
                          {r.min}–{r.max}{r.label ? ` (${r.label})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---- DEVIATION MODE ---- */}
            {currentMode === 'deviation' && (
              <>
                <div className="col-span-2 bg-blue-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-700">📌 Базовое (нормативное) значение</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">База</Label>
                      <Input type="number" step="any" value={form.base_value} onChange={e => f('base_value', e.target.value)} placeholder="Например: 2.5" className="bg-white" />
                    </div>
                    {form.base_value && (
                      <div className="text-xs text-blue-600 bg-blue-100 rounded px-2 py-1 mt-5">
                        Расчёт от {form.base_value} {PARAM_UNITS[form.parameter_name] || form.unit}
                      </div>
                    )}
                  </div>
                </div>
                {devZones.green_min !== undefined && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-500">Предпросмотр (рассчитано)</Label>
                    <ThresholdRangeBar
                      greenMin={devZones.green_min} greenMax={devZones.green_max}
                      yellowMin={devZones.yellow_min} yellowMax={devZones.yellow_max}
                      redMin={devZones.red_min} redMax={devZones.red_max}
                      showLabels
                    />
                    <div className="hidden">
                      <span className="text-green-700 font-medium">🟢 {devZones.green_min} – {devZones.green_max}</span>
                      <span className="text-yellow-700 font-medium">🟡 {devZones.yellow_min} – {devZones.yellow_max}</span>
                      <span className="text-red-700 font-medium">🔴 {devZones.red_min} – {devZones.red_max}</span>
                    </div>
                  </div>
                )}
                <div className="col-span-2 bg-green-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-700">🟢 Зелёная зона — отклонение от базы</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Влево (%)</Label><Input type="number" min="0" max="100" step="0.1" value={form.green_left_pct} onChange={e => f('green_left_pct', e.target.value)} placeholder="0" className="bg-white" /></div>
                    <div className="space-y-1"><Label className="text-xs">Вправо (%)</Label><Input type="number" min="0" max="100" step="0.1" value={form.green_right_pct} onChange={e => f('green_right_pct', e.target.value)} placeholder="0" className="bg-white" /></div>
                  </div>
                </div>
                <div className="col-span-2 bg-yellow-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-yellow-700">🟡 Жёлтая зона — отклонение от базы</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Влево (%)</Label><Input type="number" min="0" max="100" step="0.1" value={form.yellow_left_pct} onChange={e => f('yellow_left_pct', e.target.value)} placeholder="0" className="bg-white" /></div>
                    <div className="space-y-1"><Label className="text-xs">Вправо (%)</Label><Input type="number" min="0" max="100" step="0.1" value={form.yellow_right_pct} onChange={e => f('yellow_right_pct', e.target.value)} placeholder="0" className="bg-white" /></div>
                  </div>
                </div>
                <div className="col-span-2 bg-red-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-red-700">🔴 Красная зона — отклонение от базы</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Влево (%)</Label><Input type="number" min="0" max="100" step="0.1" value={form.red_left_pct} onChange={e => f('red_left_pct', e.target.value)} placeholder="0" className="bg-white" /></div>
                    <div className="space-y-1"><Label className="text-xs">Вправо (%)</Label><Input type="number" min="0" max="100" step="0.1" value={form.red_right_pct} onChange={e => f('red_right_pct', e.target.value)} placeholder="0" className="bg-white" /></div>
                  </div>
                </div>
              </>
            )}

            {/* ---- ABSOLUTE MODE ---- */}
            {currentMode === 'absolute' && (
              <>
                {(form.green_min !== '' || form.yellow_min !== '' || form.red_min !== '') && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-500">Предпросмотр диапазонов</Label>
                    <ThresholdRangeBar
                      greenMin={form.green_min} greenMax={form.green_max}
                      yellowMin={form.yellow_min} yellowMax={form.yellow_max}
                      redMin={form.red_min} redMax={form.red_max}
                      showLabels
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
              </>
            )}

            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          {save.isError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-2">
              Ошибка сохранения: {save.error?.message || 'неизвестная ошибка'}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={!form.parameter_name || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}