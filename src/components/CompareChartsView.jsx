import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import ParamChart from '@/components/ParamChart';
import { exportToPdf } from '@/utils/pdfExport';

const PARAMS = [
  { key: 'oil_health_index', title: 'OHI', subtitle: 'индекс здоровья', higherIsBetter: true, format: value => value != null ? Math.round(value) : '—' },
  { key: 'iron_mg_l', title: 'Железо', subtitle: 'мг/л', higherIsBetter: false, format: value => value != null ? value.toFixed(1) : '—' },
  { key: 'water_ppm', title: 'Вода', subtitle: 'ppm', higherIsBetter: false, format: value => value != null ? Math.round(value) : '—' },
  { key: 'water_activity', title: 'Активная вода', subtitle: '%', higherIsBetter: false, format: value => value != null ? value.toFixed(1) : '—' },
  { key: 'viscosity_40', title: 'Вязкость 40°C', subtitle: 'cSt', higherIsBetter: null, format: value => value != null ? value.toFixed(1) : '—' },
  { key: 'density', title: 'Плотность', subtitle: 'кг/м³', higherIsBetter: null, format: value => value != null ? Math.round(value) : '—' },
  { key: 'dielectric_constant', title: 'Диэлектрика', subtitle: '', higherIsBetter: false, format: value => value != null ? value.toFixed(2) : '—' },
];

export default function CompareChartsView({ enriched, thresholdRules }) {
  const [selected, setSelected] = useState(new Set(PARAMS.map(param => param.key)));
  const exportRef = useRef(null);

  const toggle = key => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleParams = PARAMS.filter(param => selected.has(param.key));

  return (
    <div className="space-y-4">
      <Card className="rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Параметры для отображения</p>
            <div className="flex flex-wrap gap-3">
              {PARAMS.map(param => (
                <label key={param.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={selected.has(param.key)} onCheckedChange={() => toggle(param.key)} />
                  <span>{param.title}</span>
                </label>
              ))}
            </div>
          </div>
          <Button className="no-print" variant="outline" size="sm" onClick={() => exportToPdf(exportRef.current, enriched)}>
            <Download className="mr-2 h-4 w-4" />
            Экспорт в PDF
          </Button>
        </div>
      </Card>

      <div ref={exportRef} className="bg-white p-1">
        <PdfHeader enriched={enriched} />
        {visibleParams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            Выберите хотя бы один параметр для отображения.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleParams.map(param => (
              <ParamChart
                key={param.key}
                paramConfig={param}
                enriched={enriched}
                thresholdRules={thresholdRules}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfHeader({ enriched }) {
  const today = new Date().toLocaleDateString('ru-RU');

  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-slate-900">Сравнение проб масла</h2>
      <p className="text-sm text-slate-500">
        {today} · Выбрано проб: {enriched.length}
      </p>
    </div>
  );
}
