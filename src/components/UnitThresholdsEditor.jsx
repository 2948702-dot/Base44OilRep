import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Palette } from 'lucide-react';
import ThresholdRangeBar from '@/components/ThresholdRangeBar';
import StepperInput from '@/components/StepperInput';

const PARAMS = ['iron_mg_l', 'water_activity', 'water_ppm', 'density', 'viscosity_40', 'dielectric_constant'];

const PARAM_LABELS = {
  iron_mg_l: 'Железо',
  water_activity: 'Активная вода',
  water_ppm: 'Растворённая вода',
  density: 'Плотность',
  viscosity_40: 'Вязкость 40°C',
  dielectric_constant: 'Диэл. постоянная',
};

const PARAM_UNITS = {
  iron_mg_l: 'мг/л',
  water_activity: '% (0-100)',
  water_ppm: 'ppm',
  density: 'кг/м³',
  viscosity_40: 'сСт (40°C)',
  dielectric_constant: 'безразмерная',
};

const LIMIT_FIELDS = ['green_min', 'green_max', 'yellow_min', 'yellow_max', 'red_min', 'red_max'];
const PCT_FIELDS = ['green_left_pct', 'green_right_pct', 'yellow_left_pct', 'yellow_right_pct', 'red_left_pct', 'red_right_pct'];
const PRESET_COLORS = ['#dc2626', '#f97316', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#9333ea', '#64748b'];
const DEF_RANGE = { min: '', max: '', color: '#16a34a', label: '' };

function hasValue(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function hasAnyLimit(rule) {
  if (!rule) return false;
  if (rule.custom_ranges_mode && Array.isArray(rule.ranges) && rule.ranges.some(r => hasValue(r.min) && hasValue(r.max))) {
    return true;
  }
  return LIMIT_FIELDS.some(field => hasValue(rule[field]));
}

function emptyRule(parameterName, oilId) {
  return {
    parameter_name: parameterName,
    oil_type_id: oilId || '',
    custom_ranges_mode: false,
    deviation_mode: false,
    ranges: [{ ...DEF_RANGE }],
    green_min: '',
    green_max: '',
    yellow_min: '',
    yellow_max: '',
    red_min: '',
    red_max: '',
    base_value: '',
    green_left_pct: '',
    green_right_pct: '',
    yellow_left_pct: '',
    yellow_right_pct: '',
    red_left_pct: '',
    red_right_pct: '',
  };
}

function calcDeviationZones(base, gl, gr, yl, yr, rl, rr) {
  const baseValue = parseFloat(base);
  if (!baseValue) return {};
  const pct = value => parseFloat(value) || 0;
  return {
    green_min: parseFloat((baseValue * (1 - pct(gl) / 100)).toFixed(4)),
    green_max: parseFloat((baseValue * (1 + pct(gr) / 100)).toFixed(4)),
    yellow_min: parseFloat((baseValue * (1 - pct(yl) / 100)).toFixed(4)),
    yellow_max: parseFloat((baseValue * (1 + pct(yr) / 100)).toFixed(4)),
    red_min: parseFloat((baseValue * (1 - pct(rl) / 100)).toFixed(4)),
    red_max: parseFloat((baseValue * (1 + pct(rr) / 100)).toFixed(4)),
  };
}

function stripPersistenceFields(rule) {
  const next = { ...(rule || {}) };
  ['id', 'created_date', 'updated_date', 'created_by', 'updated_by'].forEach(field => {
    delete next[field];
  });
  return next;
}

export default function UnitThresholdsEditor({
  value = [],
  onChange,
  oilId,
  oils = [],
  standardRules = [],
}) {
  const oil = oils.find(item => item.id === oilId);

  const oilRules = useMemo(
    () => standardRules
      .filter(rule => rule.oil_type_id === oilId && hasAnyLimit(rule))
      .map(stripPersistenceFields),
    [oilId, standardRules],
  );

  const firstParam = oilRules[0]?.parameter_name || value[0]?.parameter_name || PARAMS[0];
  const [param, setParam] = useState(firstParam);

  useEffect(() => {
    setParam(firstParam);
  }, [firstParam, oilId]);

  const customRule = value.find(rule => rule.parameter_name === param);
  const standardRule = oilRules.find(rule => rule.parameter_name === param);
  const draft = {
    ...emptyRule(param, oilId),
    ...(standardRule || {}),
    ...(customRule || {}),
    parameter_name: param,
    oil_type_id: oilId || '',
  };

  const currentMode = draft.custom_ranges_mode ? 'custom' : draft.deviation_mode ? 'deviation' : 'absolute';
  const isWaterActivity = param === 'water_activity';
  const devZones = draft.deviation_mode
    ? calcDeviationZones(
        draft.base_value,
        draft.green_left_pct,
        draft.green_right_pct,
        draft.yellow_left_pct,
        draft.yellow_right_pct,
        draft.red_left_pct,
        draft.red_right_pct,
      )
    : {};

  const commit = patch => {
    const nextRule = {
      ...draft,
      ...patch,
      parameter_name: param,
      oil_type_id: oilId || '',
    };
    const withoutCurrent = value.filter(rule => rule.parameter_name !== param);
    onChange([...withoutCurrent, nextRule]);
  };

  const updateDeviation = patch => {
    const next = { ...draft, ...patch, deviation_mode: true, custom_ranges_mode: false };
    commit({
      ...patch,
      ...calcDeviationZones(
        next.base_value,
        next.green_left_pct,
        next.green_right_pct,
        next.yellow_left_pct,
        next.yellow_right_pct,
        next.red_left_pct,
        next.red_right_pct,
      ),
      deviation_mode: true,
      custom_ranges_mode: false,
      ranges: [],
    });
  };

  const setMode = mode => {
    if (mode === 'absolute') {
      commit({ deviation_mode: false, custom_ranges_mode: false, ranges: [] });
    }
    if (mode === 'deviation') {
      updateDeviation({});
    }
    if (mode === 'custom') {
      commit({
        deviation_mode: false,
        custom_ranges_mode: true,
        ranges: Array.isArray(draft.ranges) && draft.ranges.length ? draft.ranges : [{ ...DEF_RANGE }],
      });
    }
  };

  const updateRange = (index, key, nextValue) => {
    const ranges = Array.isArray(draft.ranges) && draft.ranges.length ? draft.ranges : [{ ...DEF_RANGE }];
    commit({
      custom_ranges_mode: true,
      deviation_mode: false,
      ranges: ranges.map((range, currentIndex) => currentIndex === index ? { ...range, [key]: nextValue } : range),
    });
  };

  const addRange = () => {
    const ranges = Array.isArray(draft.ranges) ? draft.ranges : [];
    commit({ custom_ranges_mode: true, deviation_mode: false, ranges: [...ranges, { ...DEF_RANGE }] });
  };

  const removeRange = index => {
    const ranges = (draft.ranges || []).filter((_, currentIndex) => currentIndex !== index);
    commit({ custom_ranges_mode: true, deviation_mode: false, ranges: ranges.length ? ranges : [{ ...DEF_RANGE }] });
  };

  if (!oilId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Сначала выберите масло для агрегата. После этого здесь появятся стандартные границы этого масла для точечной корректировки.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-amber-200 bg-white p-4">
      <div className="rounded-lg bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-500 mb-2">Режим ввода диапазонов</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'absolute', label: 'Абсолютные значения' },
            { key: 'deviation', label: 'Отклонение от базы (%)' },
            { key: 'custom', label: 'Произвольные диапазоны' },
          ].map(mode => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setMode(mode.key)}
              className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                currentMode === mode.key
                  ? 'bg-white border-slate-800 text-slate-900 shadow-sm'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Параметр</Label>
          <Select value={param} onValueChange={setParam}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PARAMS.map(item => (
                <SelectItem key={item} value={item}>
                  {PARAM_LABELS[item]}
                  {oilRules.some(rule => rule.parameter_name === item) ? '' : ' — нет стандарта'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Масло</Label>
          <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm text-slate-600 truncate">
            {oil?.oil_name || 'Масло не найдено'}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Единица измерения</Label>
          <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm text-slate-600">
            {PARAM_UNITS[param] || '-'}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Источник</Label>
          <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm text-slate-600">
            {customRule ? 'Индивидуальная настройка агрегата' : standardRule ? 'Стандарт масла' : 'Новый индивидуальный параметр'}
          </div>
        </div>
      </div>

      {!standardRule && !customRule && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Для этого параметра у выбранного масла пока нет стандартного правила. Можно задать индивидуальные границы вручную.
        </div>
      )}

      {currentMode === 'custom' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Palette className="w-4 h-4" />
              Диапазоны
            </Label>
            <Button type="button" size="sm" variant="outline" onClick={addRange}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Добавить
            </Button>
          </div>
          {(draft.ranges || [{ ...DEF_RANGE }]).map((range, index) => (
            <div key={index} className="flex gap-3 items-start bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-400">Цвет</span>
                <input
                  type="color"
                  value={range.color || '#16a34a'}
                  onChange={event => updateRange(index, 'color', event.target.value)}
                  className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer"
                />
                <div className="flex flex-wrap gap-0.5 w-20">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => updateRange(index, 'color', color)}
                      className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${range.color === color ? 'border-slate-800 scale-110' : 'border-white shadow-sm'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">От</Label>
                  <Input type="number" step="any" value={range.min ?? ''} onChange={event => updateRange(index, 'min', event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">До</Label>
                  <Input type="number" step="any" value={range.max ?? ''} onChange={event => updateRange(index, 'max', event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Метка</Label>
                  <Input value={range.label || ''} onChange={event => updateRange(index, 'label', event.target.value)} placeholder="норма" />
                </div>
              </div>
              <button type="button" onClick={() => removeRange(index)} className="text-red-400 hover:text-red-600 mt-6 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {(draft.ranges || []).some(range => range.min !== '' && range.max !== '') && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Предпросмотр</Label>
              <ThresholdRangeBar ranges={draft.ranges} showLabels />
            </div>
          )}
        </div>
      )}

      {currentMode === 'deviation' && (
        <div className="space-y-3">
          <div className="bg-blue-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700">Базовое значение</p>
            <Input
              type="number"
              step="any"
              value={draft.base_value ?? ''}
              onChange={event => updateDeviation({ base_value: event.target.value })}
              placeholder="Например: 46"
              className="bg-white"
            />
          </div>
          {devZones.green_min !== undefined && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Предпросмотр рассчитанных диапазонов</Label>
              <ThresholdRangeBar
                greenMin={devZones.green_min}
                greenMax={devZones.green_max}
                yellowMin={devZones.yellow_min}
                yellowMax={devZones.yellow_max}
                redMin={devZones.red_min}
                redMax={devZones.red_max}
                showLabels
              />
            </div>
          )}
          {[
            { title: 'Зелёная зона — отклонение от базы', boxClass: 'bg-green-50', textClass: 'text-green-700', left: 'green_left_pct', right: 'green_right_pct' },
            { title: 'Жёлтая зона — отклонение от базы', boxClass: 'bg-yellow-50', textClass: 'text-yellow-700', left: 'yellow_left_pct', right: 'yellow_right_pct' },
            { title: 'Красная зона — отклонение от базы', boxClass: 'bg-red-50', textClass: 'text-red-700', left: 'red_left_pct', right: 'red_right_pct' },
          ].map(zone => (
            <div key={zone.title} className={`rounded-lg p-3 space-y-2 ${zone.boxClass}`}>
              <p className={`text-xs font-semibold ${zone.textClass}`}>{zone.title}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Влево (%)</Label>
                  <Input type="number" min="0" max="100" step="0.1" value={draft[zone.left] ?? ''} onChange={event => updateDeviation({ [zone.left]: event.target.value })} className="bg-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Вправо (%)</Label>
                  <Input type="number" min="0" max="100" step="0.1" value={draft[zone.right] ?? ''} onChange={event => updateDeviation({ [zone.right]: event.target.value })} className="bg-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {currentMode === 'absolute' && (
        <div className="space-y-3">
          {LIMIT_FIELDS.some(field => draft[field] !== '' && draft[field] !== undefined && draft[field] !== null) && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Предпросмотр диапазонов</Label>
              <ThresholdRangeBar
                greenMin={draft.green_min}
                greenMax={draft.green_max}
                yellowMin={draft.yellow_min}
                yellowMax={draft.yellow_max}
                redMin={draft.red_min}
                redMax={draft.red_max}
                showLabels
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 bg-green-50 rounded-lg p-3">
            <p className="col-span-2 text-xs font-semibold text-green-700 mb-1">Зелёный диапазон</p>
            <StepperInput label="Мин." value={draft.green_min || 0} onChange={next => commit({ green_min: next, custom_ranges_mode: false, deviation_mode: false, ranges: [] })} min={0} max={isWaterActivity ? 100 : 100000} />
            <StepperInput label="Макс." value={draft.green_max || 0} onChange={next => commit({ green_max: next, custom_ranges_mode: false, deviation_mode: false, ranges: [] })} min={0} max={isWaterActivity ? 100 : 100000} />
          </div>
          <div className="grid grid-cols-2 gap-3 bg-yellow-50 rounded-lg p-3">
            <p className="col-span-2 text-xs font-semibold text-yellow-700 mb-1">Жёлтый диапазон</p>
            <StepperInput label="Мин." value={draft.yellow_min || 0} onChange={next => commit({ yellow_min: next, custom_ranges_mode: false, deviation_mode: false, ranges: [] })} min={0} max={isWaterActivity ? 100 : 100000} />
            <StepperInput label="Макс." value={draft.yellow_max || 0} onChange={next => commit({ yellow_max: next, custom_ranges_mode: false, deviation_mode: false, ranges: [] })} min={0} max={isWaterActivity ? 100 : 100000} />
          </div>
          <div className="grid grid-cols-2 gap-3 bg-red-50 rounded-lg p-3">
            <p className="col-span-2 text-xs font-semibold text-red-700 mb-1">Красный диапазон</p>
            <StepperInput label="Мин." value={draft.red_min || 0} onChange={next => commit({ red_min: next, custom_ranges_mode: false, deviation_mode: false, ranges: [] })} min={0} max={isWaterActivity ? 100 : 100000} />
            <StepperInput label="Макс." value={draft.red_max || 0} onChange={next => commit({ red_max: next, custom_ranges_mode: false, deviation_mode: false, ranges: [] })} min={0} max={isWaterActivity ? 100 : 100000} />
          </div>
        </div>
      )}

      <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
        В агрегат сохраняются только индивидуальные изменения. Если снова включить стандартные границы масла, эти индивидуальные настройки перестанут применяться.
      </div>
    </div>
  );
}
