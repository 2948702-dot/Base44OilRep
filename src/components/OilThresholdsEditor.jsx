import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ThresholdRangeBar from '@/components/ThresholdRangeBar';

const ABSOLUTE_PARAMS = ['iron_mg_l', 'water_ppm', 'water_activity'];
const DEVIATION_PARAMS = ['viscosity_40', 'density', 'dielectric_constant'];
const PARAMS = [...ABSOLUTE_PARAMS, ...DEVIATION_PARAMS];

const PARAM_LABELS = {
  iron_mg_l: 'Железо',
  water_ppm: 'Вода ppm',
  water_activity: 'Активная вода',
  viscosity_40: 'Вязкость 40°C',
  density: 'Плотность',
  dielectric_constant: 'Диэлектрика',
};

const PARAM_UNITS = {
  iron_mg_l: 'мг/л',
  water_ppm: 'ppm',
  water_activity: '%',
  viscosity_40: 'сСт',
  density: 'кг/м³',
  dielectric_constant: '',
};

const PARAM_HINTS = {
  iron_mg_l: 'Введите 4 границы: старт, конец зелёной, конец жёлтой, конец красной зоны.',
  water_ppm: 'Введите 4 границы: старт, конец зелёной, конец жёлтой, конец красной зоны.',
  water_activity: 'Введите 4 границы: старт, конец зелёной, конец жёлтой, конец красной зоны.',
  viscosity_40: 'Центральное значение и симметричные отклонения: зелёное, жёлтое, красное.',
  density: 'Центральное значение и симметричные отклонения: зелёное, жёлтое, красное.',
  dielectric_constant: 'Центральное значение и симметричные отклонения: зелёное, жёлтое, красное.',
};

const DECIMALS = {
  viscosity_40: 0,
  density: 0,
  dielectric_constant: 2,
};

const NUMBER_FIELDS = [
  'green_min', 'green_max', 'yellow_min', 'yellow_max', 'red_min', 'red_max',
  'base_value', 'green_left_pct', 'green_right_pct', 'yellow_left_pct', 'yellow_right_pct',
  'red_left_pct', 'red_right_pct',
];

function hasValue(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function toInputValue(value) {
  return hasValue(value) ? String(value) : '';
}

function toOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function roundByParam(param, value) {
  if (!Number.isFinite(value)) return undefined;
  const decimals = DECIMALS[param] ?? 0;
  return Number(value.toFixed(decimals));
}

function calculateDeviationRule(param, baseValue, greenLeftPct, greenRightPct, yellowLeftPct, yellowRightPct, redLeftPct, redRightPct) {
  const base = Number(baseValue);
  const greenLeft = Number(greenLeftPct);
  const greenRight = Number(greenRightPct);
  const yellowLeft = Number(yellowLeftPct);
  const yellowRight = Number(yellowRightPct);
  const redLeft = Number(redLeftPct);
  const redRight = Number(redRightPct);

  if (![base, greenLeft, greenRight, yellowLeft, yellowRight, redLeft, redRight].every(Number.isFinite)) {
    return {};
  }

  const range = (leftPct, rightPct) => ({
    min: roundByParam(param, base * (1 - leftPct / 100)),
    max: roundByParam(param, base * (1 + rightPct / 100)),
  });

  const greenRange = range(greenLeft, greenRight);
  const yellowRange = range(yellowLeft, yellowRight);
  const redRange = range(redLeft, redRight);

  return {
    green_min: greenRange.min,
    green_max: greenRange.max,
    yellow_min: yellowRange.min,
    yellow_max: yellowRange.max,
    red_min: redRange.min,
    red_max: redRange.max,
  };
}

function emptyDraft(param) {
  return ABSOLUTE_PARAMS.includes(param)
    ? {
        start: '',
        green_end: '',
        yellow_end: '',
        red_end: '',
      }
    : {
        base_value: '',
        green_left_pct: '',
        green_right_pct: '',
        yellow_left_pct: '',
        yellow_right_pct: '',
        red_left_pct: '',
        red_right_pct: '',
      };
}

function draftFromRule(param, rule) {
  if (!rule) return emptyDraft(param);

  if (ABSOLUTE_PARAMS.includes(param)) {
    return {
      id: rule.id,
      start: toInputValue(rule.green_min),
      green_end: toInputValue(rule.green_max),
      yellow_end: toInputValue(rule.yellow_max),
      red_end: toInputValue(rule.red_max),
    };
  }

  return {
    id: rule.id,
    base_value: toInputValue(rule.base_value),
    green_left_pct: toInputValue(rule.green_left_pct),
    green_right_pct: toInputValue(rule.green_right_pct),
    yellow_left_pct: toInputValue(rule.yellow_left_pct),
    yellow_right_pct: toInputValue(rule.yellow_right_pct),
    red_left_pct: toInputValue(rule.red_left_pct),
    red_right_pct: toInputValue(rule.red_right_pct),
  };
}

function absolutePreview(draft) {
  if (![draft.start, draft.green_end, draft.yellow_end, draft.red_end].every(hasValue)) return null;
  return {
    green_min: Number(draft.start),
    green_max: Number(draft.green_end),
    yellow_min: Number(draft.green_end),
    yellow_max: Number(draft.yellow_end),
    red_min: Number(draft.yellow_end),
    red_max: Number(draft.red_end),
  };
}

function deviationPreview(param, draft) {
  return calculateDeviationRule(
    param,
    draft.base_value,
    draft.green_left_pct,
    draft.green_right_pct,
    draft.yellow_left_pct,
    draft.yellow_right_pct,
    draft.red_left_pct,
    draft.red_right_pct,
  );
}

function cleanPayload(payload) {
  const next = { ...payload };
  NUMBER_FIELDS.forEach(field => {
    const value = toOptionalNumber(next[field]);
    if (value === undefined) delete next[field];
    else next[field] = value;
  });
  Object.keys(next).forEach(field => next[field] === undefined && delete next[field]);
  return next;
}

const OilThresholdsEditor = forwardRef(function OilThresholdsEditor({ oilId }, ref) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState({});
  const [savedParams, setSavedParams] = useState(new Set());

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['threshold-rules-oil', oilId],
    queryFn: () => base44.entities.ThresholdRule.filter({ oil_type_id: oilId }),
    enabled: !!oilId,
  });

  useEffect(() => {
    const next = {};
    const saved = new Set();
    rules.forEach(rule => {
      if (PARAMS.includes(rule.parameter_name) && !next[rule.parameter_name]) {
        next[rule.parameter_name] = draftFromRule(rule.parameter_name, rule);
        saved.add(rule.parameter_name);
      }
    });
    setDrafts(Object.fromEntries(PARAMS.map(param => [param, next[param] || emptyDraft(param)])));
    setSavedParams(saved);
  }, [oilId, rules]);

  const saveRule = useMutation({
    mutationFn: async ({ param, draft }) => {
      let payload;

      if (ABSOLUTE_PARAMS.includes(param)) {
        const preview = absolutePreview(draft);
        payload = {
          oil_type_id: oilId,
          parameter_name: param,
          unit: PARAM_UNITS[param],
          equipment_type: 'all',
          custom_ranges_mode: false,
          deviation_mode: false,
          ranges: [],
          ...preview,
        };
      } else {
        const preview = deviationPreview(param, draft);
        payload = {
          oil_type_id: oilId,
          parameter_name: param,
          unit: PARAM_UNITS[param],
          equipment_type: 'all',
          custom_ranges_mode: false,
          deviation_mode: true,
          ranges: [],
          base_value: draft.base_value,
          green_left_pct: draft.green_left_pct,
          green_right_pct: draft.green_right_pct,
          yellow_left_pct: draft.yellow_left_pct,
          yellow_right_pct: draft.yellow_right_pct,
          red_left_pct: draft.red_left_pct,
          red_right_pct: draft.red_right_pct,
          ...preview,
        };
      }

      const clean = cleanPayload(payload);
      return draft.id
        ? base44.entities.ThresholdRule.update(draft.id, clean)
        : base44.entities.ThresholdRule.create(clean);
    },
    onSuccess: (result, { param }) => {
      qc.invalidateQueries({ queryKey: ['threshold-rules-oil', oilId] });
      qc.invalidateQueries({ queryKey: ['threshold-rules'] });
      setDrafts(prev => ({ ...prev, [param]: { ...prev[param], id: result.id } }));
      setSavedParams(prev => new Set([...prev, param]));
    },
  });

  const getDraft = param => drafts[param] || emptyDraft(param);

  const updateField = (param, field, value) => {
    setDrafts(prev => ({
      ...prev,
      [param]: {
        ...getDraft(param),
        [field]: value,
      },
    }));
  };

  const canSave = param => {
    const draft = getDraft(param);
    return ABSOLUTE_PARAMS.includes(param)
      ? [draft.start, draft.green_end, draft.yellow_end, draft.red_end].every(hasValue)
      : [
          draft.base_value,
          draft.green_left_pct,
          draft.green_right_pct,
          draft.yellow_left_pct,
          draft.yellow_right_pct,
          draft.red_left_pct,
          draft.red_right_pct,
        ].every(hasValue);
  };

  const saveAll = async () => {
    const errors = [];
    for (const param of PARAMS) {
      if (!canSave(param)) continue;
      try {
        await saveRule.mutateAsync({ param, draft: getDraft(param) });
      } catch (err) {
        errors.push({ param, message: err?.message || 'Не удалось сохранить' });
      }
    }
    return errors;
  };

  useImperativeHandle(ref, () => ({ saveAll }), [drafts, oilId]);

  if (!oilId) {
    return (
      <p className="text-sm text-slate-400 italic">
        Сохраните масло, чтобы задать стандартные границы параметров.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400">Загрузка...</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">Стандартные границы масла</p>
        <p className="text-xs text-slate-500 mt-1">
          Эти значения применяются ко всем агрегатам с этим маслом, если в агрегате не включены индивидуальные границы.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Сигнальные показатели</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Вводятся 4 числа: начало, конец зелёной зоны, конец жёлтой зоны, конец красной зоны. Границы стыкуются автоматически.
          </p>
        </div>

        {ABSOLUTE_PARAMS.map(param => {
          const draft = getDraft(param);
          const preview = absolutePreview(draft);
          const isSaved = savedParams.has(param);

          return (
            <div key={param} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="grid grid-cols-[minmax(130px,1fr)_repeat(4,minmax(76px,92px))_38px] gap-2 items-end">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {PARAM_LABELS[param]}
                    {isSaved && <span className="ml-1 text-green-600 text-xs">✓</span>}
                  </p>
                  <p className="text-xs text-slate-400">{PARAM_UNITS[param]} · {PARAM_HINTS[param]}</p>
                </div>
                <NumberCell label="Старт" value={draft.start} onChange={value => updateField(param, 'start', value)} />
                <NumberCell label="Зелёный до" value={draft.green_end} onChange={value => updateField(param, 'green_end', value)} />
                <NumberCell label="Жёлтый до" value={draft.yellow_end} onChange={value => updateField(param, 'yellow_end', value)} />
                <NumberCell label="Красный до" value={draft.red_end} onChange={value => updateField(param, 'red_end', value)} />
                <SaveStatusIndicator isSaved={isSaved} isReady={canSave(param)} />
              </div>
              {preview && (
                <div className="mt-3">
                  <ThresholdRangeBar
                    compact
                    showLabels
                    greenMin={preview.green_min}
                    greenMax={preview.green_max}
                    yellowMin={preview.yellow_min}
                    yellowMax={preview.yellow_max}
                    redMin={preview.red_min}
                    redMax={preview.red_max}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Паспортные показатели с отклонением</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Вводится центральное значение и отдельные отклонения влево/вправо для зелёной, жёлтой и красной зон.
          </p>
        </div>

        {DEVIATION_PARAMS.map(param => {
          const draft = getDraft(param);
          const preview = deviationPreview(param, draft);
          const isSaved = savedParams.has(param);

          return (
            <div key={param} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="grid grid-cols-[minmax(130px,1fr)_repeat(7,minmax(70px,86px))_38px] gap-2 items-end">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {PARAM_LABELS[param]}
                    {isSaved && <span className="ml-1 text-green-600 text-xs">✓</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {PARAM_UNITS[param] || 'б/р'} · округление {DECIMALS[param]} знаков
                  </p>
                </div>
                <NumberCell label="Центр" value={draft.base_value} onChange={value => updateField(param, 'base_value', value)} />
                <NumberCell label="Зел. влево %" value={draft.green_left_pct} onChange={value => updateField(param, 'green_left_pct', value)} />
                <NumberCell label="Зел. вправо %" value={draft.green_right_pct} onChange={value => updateField(param, 'green_right_pct', value)} />
                <NumberCell label="Жёлт. влево %" value={draft.yellow_left_pct} onChange={value => updateField(param, 'yellow_left_pct', value)} />
                <NumberCell label="Жёлт. вправо %" value={draft.yellow_right_pct} onChange={value => updateField(param, 'yellow_right_pct', value)} />
                <NumberCell label="Красн. влево %" value={draft.red_left_pct} onChange={value => updateField(param, 'red_left_pct', value)} />
                <NumberCell label="Красн. вправо %" value={draft.red_right_pct} onChange={value => updateField(param, 'red_right_pct', value)} />
                <SaveStatusIndicator isSaved={isSaved} isReady={canSave(param)} />
              </div>
              {preview.green_min !== undefined && (
                <div className="mt-3">
                  <ThresholdRangeBar
                    compact
                    showLabels
                    greenMin={preview.green_min}
                    greenMax={preview.green_max}
                    yellowMin={preview.yellow_min}
                    yellowMax={preview.yellow_max}
                    redMin={preview.red_min}
                    redMax={preview.red_max}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
});

export default OilThresholdsEditor;

function SaveStatusIndicator({ isSaved, isReady }) {
  const title = isSaved ? 'Сохранено' : isReady ? 'Изменения не сохранены' : '';

  return (
    <div className="flex h-9 w-9 items-center justify-center" title={title}>
      {isSaved && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
      {!isSaved && isReady && <div className="h-2 w-2 rounded-full bg-slate-300" />}
    </div>
  );
}

function NumberCell({ label, value, onChange }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-slate-500">{label}</Label>
      <Input
        type="number"
        step="any"
        value={value ?? ''}
        onChange={event => onChange(event.target.value)}
        className="h-9 text-sm"
      />
    </div>
  );
}
