import { Input } from '@/components/ui/input';

const PARAMS = ['iron_mg_l', 'water_activity', 'water_ppm', 'density', 'viscosity_40', 'dielectric_constant'];
const PARAM_LABELS = {
  iron_mg_l: 'Железо', water_activity: 'Акт. вода', water_ppm: 'Раств. вода',
  density: 'Плотность', viscosity_40: 'Вязк. 40°C', dielectric_constant: 'Диэл. пост.',
};
const PARAM_UNITS = {
  iron_mg_l: 'мг/л', water_activity: '%', water_ppm: 'ppm',
  density: 'кг/м³', viscosity_40: 'сСт', dielectric_constant: '',
};
const FIELDS = ['green_min','green_max','yellow_min','yellow_max','red_min','red_max'];

export default function UnitThresholdsEditor({ value = [], onChange }) {
  const get = (param) =>
    value.find(r => r.parameter_name === param) ||
    { parameter_name: param, green_min: '', green_max: '', yellow_min: '', yellow_max: '', red_min: '', red_max: '' };

  const update = (param, field, val) => {
    const others = value.filter(r => r.parameter_name !== param);
    const current = get(param);
    onChange([...others, { ...current, [field]: val === '' ? '' : Number(val) }]);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-2 py-1.5 font-medium text-slate-600">Параметр</th>
            <th colSpan={2} className="px-1 py-1.5 font-medium text-green-700 text-center">Зелёная</th>
            <th colSpan={2} className="px-1 py-1.5 font-medium text-yellow-700 text-center">Жёлтая</th>
            <th colSpan={2} className="px-1 py-1.5 font-medium text-red-700 text-center">Красная</th>
          </tr>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-normal">
            <th></th>
            <th className="px-1 py-0.5">мин</th><th className="px-1 py-0.5">макс</th>
            <th className="px-1 py-0.5">мин</th><th className="px-1 py-0.5">макс</th>
            <th className="px-1 py-0.5">мин</th><th className="px-1 py-0.5">макс</th>
          </tr>
        </thead>
        <tbody>
          {PARAMS.map(param => {
            const d = get(param);
            return (
              <tr key={param} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">
                  {PARAM_LABELS[param]}
                  {PARAM_UNITS[param] && <span className="text-slate-400 ml-1 text-[10px]">{PARAM_UNITS[param]}</span>}
                </td>
                {FIELDS.map(field => (
                  <td key={field} className="px-0.5 py-1">
                    <Input
                      type="number" step="any"
                      value={d[field] ?? ''}
                      onChange={e => update(param, field, e.target.value)}
                      className="h-6 w-14 text-xs px-1"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}