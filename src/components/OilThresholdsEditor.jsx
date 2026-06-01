import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save } from 'lucide-react';

const PARAMS = ['iron_mg_l', 'water_activity', 'water_ppm', 'density', 'viscosity_40', 'dielectric_constant'];
const PARAM_LABELS = {
  iron_mg_l: 'Железо', water_activity: 'Активная вода', water_ppm: 'Растворённая вода',
  density: 'Плотность', viscosity_40: 'Вязкость 40°C', dielectric_constant: 'Диэл. постоянная',
};
const PARAM_UNITS = {
  iron_mg_l: 'мг/л', water_activity: '%', water_ppm: 'ppm',
  density: 'кг/м³', viscosity_40: 'сСт', dielectric_constant: '',
};
const FIELDS = ['green_min','green_max','yellow_min','yellow_max','red_min','red_max'];

const emptyRow = () => ({ green_min: '', green_max: '', yellow_min: '', yellow_max: '', red_min: '', red_max: '' });

export default function OilThresholdsEditor({ oilId }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState({});

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['threshold-rules-oil', oilId],
    queryFn: () => base44.entities.ThresholdRule.filter({ oil_type_id: oilId }),
    enabled: !!oilId,
  });

  useEffect(() => {
    const next = {};
    rules.forEach(r => {
      if (!next[r.parameter_name]) {
        next[r.parameter_name] = {
          id: r.id,
          green_min: r.green_min ?? '', green_max: r.green_max ?? '',
          yellow_min: r.yellow_min ?? '', yellow_max: r.yellow_max ?? '',
          red_min: r.red_min ?? '', red_max: r.red_max ?? '',
        };
      }
    });
    setDrafts(next);
  }, [oilId, rules]);

  const saveRule = useMutation({
    mutationFn: async ({ param, data }) => {
      const toNum = v => v === '' || v === null || v === undefined ? undefined : Number(v);
      const payload = {
        oil_type_id: oilId,
        parameter_name: param,
        custom_ranges_mode: false,
        deviation_mode: false,
        ranges: [],
        green_min: toNum(data.green_min), green_max: toNum(data.green_max),
        yellow_min: toNum(data.yellow_min), yellow_max: toNum(data.yellow_max),
        red_min: toNum(data.red_min), red_max: toNum(data.red_max),
      };
      // Remove undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
      return data.id
        ? base44.entities.ThresholdRule.update(data.id, payload)
        : base44.entities.ThresholdRule.create(payload);
    },
    onSuccess: (result, { param }) => {
      qc.invalidateQueries({ queryKey: ['threshold-rules-oil', oilId] });
      qc.invalidateQueries({ queryKey: ['threshold-rules'] });
      // Update local draft with the saved id
      setDrafts(prev => ({ ...prev, [param]: { ...prev[param], id: result.id } }));
    },
  });

  const getRow = (param) => drafts[param] || emptyRow();

  const updateField = (param, field, val) => {
    setDrafts(prev => ({
      ...prev,
      [param]: { ...getRow(param), [field]: val }
    }));
  };

  if (!oilId) {
    return <p className="text-sm text-slate-400 italic">Сохраните масло, чтобы задать стандартные границы параметров.</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400">Загрузка...</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Стандартные границы применяются ко всем агрегатам с этим маслом (если не переопределены на уровне агрегата). Сохраняйте каждую строку отдельно.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-2 py-1.5 font-medium text-slate-600">Параметр</th>
              <th colSpan={2} className="px-1 py-1.5 font-medium text-green-700 text-center">Зелёная</th>
              <th colSpan={2} className="px-1 py-1.5 font-medium text-yellow-700 text-center">Жёлтая</th>
              <th colSpan={2} className="px-1 py-1.5 font-medium text-red-700 text-center">Красная</th>
              <th className="px-1 py-1.5"></th>
            </tr>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-normal">
              <th></th>
              <th className="px-1 py-0.5">мин</th><th className="px-1 py-0.5">макс</th>
              <th className="px-1 py-0.5">мин</th><th className="px-1 py-0.5">макс</th>
              <th className="px-1 py-0.5">мин</th><th className="px-1 py-0.5">макс</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PARAMS.map(param => {
              const d = getRow(param);
              const isSaved = !!d.id;
              return (
                <tr key={param} className={`border-b border-slate-100 hover:bg-slate-50 ${isSaved ? '' : 'opacity-70'}`}>
                  <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">
                    {PARAM_LABELS[param]}
                    {PARAM_UNITS[param] && <span className="text-slate-400 ml-1 text-[10px]">{PARAM_UNITS[param]}</span>}
                    {isSaved && <span className="ml-1 text-green-500 text-[10px]">✓</span>}
                  </td>
                  {FIELDS.map(field => (
                    <td key={field} className="px-0.5 py-1">
                      <Input
                        type="number" step="any"
                        value={d[field] ?? ''}
                        onChange={e => updateField(param, field, e.target.value)}
                        className="h-6 w-14 text-xs px-1"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <Button
                      size="sm" variant="ghost" className="h-6 w-6 p-0"
                      onClick={() => saveRule.mutate({ param, data: d })}
                      disabled={saveRule.isPending}
                      title="Сохранить строку"
                    >
                      <Save className="w-3.5 h-3.5 text-blue-500" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
