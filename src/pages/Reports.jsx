import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Printer } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';

export default function Reports() {
  const [selectedSample, setSelectedSample] = useState('');
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);

  const { data: samples = [] } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: results = [] } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: lifecycles = [] } = useQuery({ queryKey: ['oil-lifecycles'], queryFn: () => base44.entities.OilLifecycle.list() });

  const filteredSamples = samples.filter(s =>
    s.sample_number?.toLowerCase().includes(search.toLowerCase()) ||
    clients.find(c => c.id === s.client_id)?.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const sample = samples.find(s => s.id === selectedSample);
  const result = results.find(r => r.sample_id === selectedSample);
  const client = clients.find(c => c.id === sample?.client_id);
  const asset = assets.find(a => a.id === sample?.asset_id);
  const unit = units.find(u => u.id === sample?.equipment_unit_id);
  const point = points.find(p => p.id === sample?.sampling_point_id);
  const oil = oils.find(o => o.id === (sample?.oil_type_id || point?.oil_type_id));
  const lifecycle = lifecycles.find(l => l.id === sample?.lifecycle_id);

  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';

  const generatePDF = async () => {
    if (!sample) return;
    setGenerating(true);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;
    let y = 20;
    const pageW = 210;

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 30, 'F');
    doc.setFontSize(18); doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold');
    doc.text('SmartOil', margin, 18);
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text('Лабораторный отчёт об анализе масла', margin, 25);
    doc.setFontSize(10); doc.setTextColor(148, 163, 184);
    doc.text(`Отчёт № ${sample.sample_number}`, pageW - margin, 18, { align: 'right' });
    doc.text(`Дата: ${sample.sampling_date}`, pageW - margin, 25, { align: 'right' });
    y = 40;

    doc.setTextColor(15, 23, 42);
    // Client & Asset info block
    const infoBlock = (label, value, x, blockY) => {
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(label, x, blockY);
      doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(15, 23, 42);
      doc.text(value || '—', x, blockY + 4);
    };
    infoBlock('КЛИЕНТ', client?.company_name, margin, y);
    infoBlock('АКТИВ', asset?.asset_name, 70, y);
    infoBlock('ОБОРУДОВАНИЕ', unit?.unit_name, 125, y);
    y += 14;
    infoBlock('ТОЧКА ОТБОРА', point?.point_name, margin, y);
    infoBlock('МАСЛО', oil?.oil_name, 70, y);
    infoBlock('СОСТОЯНИЕ АГРЕГАТА', sample.engine_state === 'warm' ? 'Прогретый' : 'Холодный', 125, y);
    y += 14;
    infoBlock('М/Ч ВСЕГО', String(sample.total_hours_at_sampling || '—'), margin, y);
    infoBlock('М/Ч МАСЛА', String(sample.oil_hours_at_sampling || '—'), 70, y);
    if (lifecycle) infoBlock('ЖИЗН. ЦИКЛ С', lifecycle.start_date, 125, y);
    y += 16;

    // Divider
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y); y += 8;

    // OHI Box
    if (result) {
      const ohiColor = result.overall_status === 'green' ? [22, 163, 74] : result.overall_status === 'yellow' ? [202, 138, 4] : [220, 38, 38];
      doc.setFillColor(...ohiColor);
      doc.roundedRect(margin, y, 50, 22, 3, 3, 'F');
      doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold');
      doc.text('OIL HEALTH INDEX', margin + 25, y + 8, { align: 'center' });
      doc.setFontSize(18);
      doc.text(`${result.oil_health_index ?? '—'}%`, margin + 25, y + 18, { align: 'center' });

      // Index sub-blocks
      const indices = [
        ['Вода', result.water_index], ['Износ', result.wear_index],
        ['Вязкость', result.viscosity_index_calc], ['Диэлектр.', result.dielectric_index]
      ];
      let ix = 72;
      indices.forEach(([lbl, val]) => {
        doc.setFillColor(248, 250, 252); doc.roundedRect(ix, y, 28, 22, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240); doc.roundedRect(ix, y, 28, 22, 2, 2, 'S');
        doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.setFont(undefined, 'normal');
        doc.text(lbl, ix + 14, y + 7, { align: 'center' });
        doc.setFontSize(13); doc.setTextColor(15, 23, 42); doc.setFont(undefined, 'bold');
        doc.text(String(val ?? '—'), ix + 14, y + 17, { align: 'center' });
        ix += 32;
      });
      y += 30;
    }

    // Analysis results table
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('Результаты анализа', margin, y); y += 6;

    if (result) {
      const params = [
        ['Железо', result.iron_mg_l, oil?.passport_dielectric, 'мг/л'],
        ['Вода растворённая', result.water_ppm, oil?.lab_water_ppm, 'ppm'],
        ['Активность воды (aw)', result.water_activity, oil?.lab_water_activity, ''],
        ['Вязкость при 40°C', result.viscosity_40, oil?.passport_viscosity_40, 'мм²/с'],
        ['Вязкость при 100°C', result.viscosity_100, oil?.passport_viscosity_100, 'мм²/с'],
        ['Плотность', result.density, oil?.passport_density_15, 'кг/м³'],
        ['Диэлектрическая пост.', result.dielectric_constant, oil?.passport_dielectric, ''],
      ];

      // Table header
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageW - 2 * margin, 7, 'F');
      doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(71, 85, 105);
      doc.text('Параметр', margin + 2, y + 5);
      doc.text('Измерено', 110, y + 5);
      doc.text('Референс', 135, y + 5);
      doc.text('Отклонение', 160, y + 5);
      doc.text('Ед.', 185, y + 5);
      y += 9;

      params.forEach(([name, measured, ref, unit]) => {
        const dev = (measured != null && ref != null) ? ((measured - ref) / ref * 100).toFixed(1) : null;
        if (dev !== null) {
          const absD = Math.abs(+dev);
          if (absD < 5) doc.setTextColor(22, 163, 74);
          else if (absD < 15) doc.setTextColor(202, 138, 4);
          else doc.setTextColor(220, 38, 38);
        } else doc.setTextColor(100, 116, 139);

        doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(15, 23, 42);
        doc.text(name, margin + 2, y + 4);
        doc.setFont(undefined, 'bold');
        doc.text(measured != null ? String(measured) : '—', 110, y + 4);
        doc.setFont(undefined, 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(ref != null ? String(ref) : '—', 135, y + 4);
        if (dev !== null) {
          const absD = Math.abs(+dev);
          if (absD < 5) doc.setTextColor(22, 163, 74);
          else if (absD < 15) doc.setTextColor(202, 138, 4);
          else doc.setTextColor(220, 38, 38);
          doc.setFont(undefined, 'bold');
          doc.text(`${+dev > 0 ? '+' : ''}${dev}%`, 160, y + 4);
        } else { doc.text('—', 160, y + 4); }
        doc.setTextColor(100, 116, 139); doc.setFont(undefined, 'normal');
        doc.text(unit, 185, y + 4);
        doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.2);
        doc.line(margin, y + 7, pageW - margin, y + 7);
        y += 9;
      });
    }

    y += 5;
    // Recommendation
    if (result?.recommendation_text) {
      doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(15, 23, 42);
      doc.text('Рекомендация', margin, y); y += 5;
      doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(result.recommendation_text, pageW - 2 * margin);
      doc.text(lines, margin, y); y += lines.length * 5 + 4;
    }

    // Signature area
    y = Math.max(y, 255);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
    doc.line(margin, y, 90, y);
    doc.line(120, y, pageW - margin, y);
    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text('Лаборант / дата', margin, y + 4);
    doc.text('Инженер / подпись', 120, y + 4);

    // Footer
    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text(`SmartOil · Отчёт сформирован ${new Date().toLocaleDateString('ru-RU')}`, pageW / 2, 290, { align: 'center' });

    doc.save(`SmartOil_${sample.sample_number}.pdf`);
    setGenerating(false);
  };

  const ohiColor = result?.oil_health_index >= 70 ? 'text-green-600' : result?.oil_health_index >= 40 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Отчёты PDF</h1>
        <p className="text-slate-500 text-sm mt-0.5">Генерация лабораторных отчётов по каждой пробе</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sample selector */}
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Выберите пробу</h3>
            <Input placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} className="mt-2 h-8 text-sm" />
          </div>
          <div className="overflow-auto max-h-[500px]">
            {filteredSamples.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">Пробы не найдены</div>
            ) : filteredSamples.map(s => {
              const r = results.find(r => r.sample_id === s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSample(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedSample === s.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-xs font-bold text-slate-900">{s.sample_number}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{getName(clients, s.client_id, 'company_name')}</p>
                      <p className="text-xs text-slate-400">{s.sampling_date}</p>
                    </div>
                    {r && <StatusBadge status={r.overall_status} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          {!sample ? (
            <div className="bg-white rounded-lg border border-slate-200 h-full min-h-[300px] flex items-center justify-center">
              <div className="text-center text-slate-400">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Выберите пробу для предпросмотра</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Проба {sample.sample_number}</h3>
                  <p className="text-sm text-slate-500">{client?.company_name} · {sample.sampling_date}</p>
                </div>
                <Button onClick={generatePDF} disabled={generating || !result} className="gap-2">
                  <Download className="w-4 h-4" />
                  {generating ? 'Генерация...' : 'Скачать PDF'}
                </Button>
              </div>
              {!result && (
                <div className="px-5 py-4 bg-yellow-50 border-b border-yellow-100 text-sm text-yellow-700">
                  Результаты анализа не введены. Добавьте результаты для генерации отчёта.
                </div>
              )}
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Актив</p>
                    <p className="text-sm font-medium">{asset?.asset_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Оборудование</p>
                    <p className="text-sm font-medium">{unit?.unit_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Точка отбора</p>
                    <p className="text-sm font-medium">{point?.point_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Масло</p>
                    <p className="text-sm font-medium">{oil?.oil_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">М/ч всего</p>
                    <p className="text-sm font-medium">{sample.total_hours_at_sampling || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">М/ч масла</p>
                    <p className="text-sm font-medium">{sample.oil_hours_at_sampling || '—'}</p>
                  </div>
                </div>

                {result && (
                  <>
                    <div className="border-t pt-4">
                      <div className="flex items-center gap-4 mb-3">
                        <div>
                          <p className="text-xs text-slate-500">Oil Health Index</p>
                          <p className={`text-3xl font-black ${ohiColor}`}>{result.oil_health_index ?? '—'}</p>
                        </div>
                        <StatusBadge status={result.overall_status} />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[['Вода', result.water_index], ['Износ', result.wear_index], ['Вязкость', result.viscosity_index_calc], ['Диэлектр.', result.dielectric_index]].map(([l, v]) => (
                        <div key={l} className="bg-slate-50 rounded-lg p-2 text-center">
                          <p className="text-xs text-slate-500">{l}</p>
                          <p className="text-lg font-bold text-slate-900">{v ?? '—'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500 mb-1">Рекомендация</p>
                      <p className="text-sm text-slate-700">{result.recommendation_text || '—'}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}