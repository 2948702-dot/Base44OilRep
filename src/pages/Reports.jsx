import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Search } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';

export default function Reports() {
  const [selectedSample, setSelectedSample] = useState(null);
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

  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const getResult = (sampleId) => results.find(r => r.sample_id === sampleId);

  const filteredSamples = samples.filter(s =>
    s.sample_number?.toLowerCase().includes(search.toLowerCase()) ||
    getName(clients, s.client_id, 'company_name').toLowerCase().includes(search.toLowerCase()) ||
    getName(assets, s.asset_id, 'asset_name').toLowerCase().includes(search.toLowerCase())
  );

  const selectedResult = selectedSample ? getResult(selectedSample.id) : null;
  const selectedOil = selectedSample ? oils.find(o => o.id === (selectedSample.oil_type_id || points.find(p => p.id === selectedSample.sampling_point_id)?.oil_type_id)) : null;
  const selectedLC = selectedSample ? lifecycles.find(l => l.id === selectedSample.lifecycle_id && l.status === 'active') : null;

  const generatePDF = async () => {
    if (!selectedSample) return;
    setGenerating(true);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const client = clients.find(c => c.id === selectedSample.client_id);
    const asset = assets.find(a => a.id === selectedSample.asset_id);
    const unit = units.find(u => u.id === selectedSample.equipment_unit_id);
    const point = points.find(p => p.id === selectedSample.sampling_point_id);
    const res = selectedResult;
    const oil = selectedOil;

    const margin = 15;
    let y = margin;

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SmartOil', margin, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Oil Condition Monitoring Report', margin, 18);
    doc.setFontSize(11);
    doc.text(`Report No: ${selectedSample.sample_number}`, 210 - margin, 12, { align: 'right' });
    doc.setFontSize(9);
    doc.text(`Date: ${selectedSample.sampling_date}`, 210 - margin, 18, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y = 35;

    // Status bar
    if (res?.overall_status) {
      const statusColors = { green: [22, 163, 74], yellow: [202, 138, 4], red: [220, 38, 38] };
      const [r, g, b] = statusColors[res.overall_status] || [100, 116, 139];
      doc.setFillColor(r, g, b);
      doc.rect(0, y - 3, 210, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const statusLabel = { green: 'STATUS: NORMAL', yellow: 'STATUS: ATTENTION REQUIRED', red: 'STATUS: CRITICAL' }[res.overall_status];
      doc.text(statusLabel, 105, y + 4, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 12;
    }

    // Section helper
    const section = (title) => {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, 180, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text(title.toUpperCase(), margin + 2, y + 4.5);
      doc.setTextColor(0, 0, 0);
      y += 8;
    };

    const row2 = (label, value, x2 = 110, label2 = '', value2 = '') => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(label, margin, y);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(String(value || '—'), margin + 42, y);
      if (label2) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(label2, x2, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(String(value2 || '—'), x2 + 42, y);
      }
      y += 6;
    };

    section('Client & Asset Information');
    row2('Client:', client?.company_name, 110, 'Asset:', asset?.asset_name);
    row2('Equipment Unit:', unit?.unit_name, 110, 'Sampling Point:', point?.point_name);
    row2('Oil Type:', oil?.oil_name, 110, 'Manufacturer:', oil?.manufacturer);
    row2('Sampling Date:', selectedSample.sampling_date, 110, 'Engine State:', selectedSample.engine_state === 'warm' ? 'Warm' : 'Cold');
    row2('Total Hours:', String(selectedSample.total_hours_at_sampling ?? '—'), 110, 'Oil Hours:', String(selectedSample.oil_hours_at_sampling ?? '—'));
    y += 2;

    if (res) {
      section('Analysis Results');
      const params = [
        ['Iron (Fe)', res.iron_mg_l, 'mg/L', oil?.passport_dielectric],
        ['Water (dissolved)', res.water_ppm, 'ppm', oil?.lab_water_ppm],
        ['Water Activity (aw)', res.water_activity, 'aw', oil?.lab_water_activity],
        ['Viscosity at 40°C', res.viscosity_40, 'mm²/s', oil?.passport_viscosity_40],
        ['Viscosity at 100°C', res.viscosity_100, 'mm²/s', oil?.passport_viscosity_100],
        ['Density', res.density, 'kg/m³', oil?.passport_density_15],
        ['Dielectric Constant', res.dielectric_constant, '', oil?.passport_dielectric],
      ];

      // Table header
      doc.setFillColor(226, 232, 240);
      doc.rect(margin, y, 180, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('Parameter', margin + 2, y + 4.5);
      doc.text('Measured', margin + 65, y + 4.5);
      doc.text('Reference', margin + 95, y + 4.5);
      doc.text('Unit', margin + 125, y + 4.5);
      doc.text('Index', margin + 148, y + 4.5);
      y += 8;

      const indices = { 0: res.wear_index, 1: res.water_index, 2: res.water_index, 3: res.viscosity_index_calc, 4: res.viscosity_index_calc, 5: res.dielectric_index, 6: res.dielectric_index };
      params.forEach(([name, val, unit, ref], i) => {
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 1, 180, 6, 'F'); }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text(name, margin + 2, y + 4);
        doc.text(val != null ? String(val) : '—', margin + 65, y + 4);
        doc.text(ref != null ? String(ref) : '—', margin + 95, y + 4);
        doc.text(unit, margin + 125, y + 4);
        const idx = indices[i];
        if (idx != null) {
          const [ir, ig, ib] = idx >= 70 ? [22, 163, 74] : idx >= 40 ? [202, 138, 4] : [220, 38, 38];
          doc.setTextColor(ir, ig, ib);
          doc.setFont('helvetica', 'bold');
          doc.text(String(idx), margin + 148, y + 4);
          doc.setTextColor(30, 41, 59);
        }
        y += 6;
      });
      y += 2;

      section('Oil Health Index');
      const ohiColors = res.oil_health_index >= 70 ? [22, 163, 74] : res.oil_health_index >= 40 ? [202, 138, 4] : [220, 38, 38];
      doc.setFillColor(...ohiColors);
      doc.roundedRect(margin, y, 40, 15, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(String(res.oil_health_index ?? '—'), margin + 20, y + 11, { align: 'center' });
      doc.setFontSize(7);
      doc.text('OHI / 100', margin + 20, y + 14.5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      if (res.recommendation_text) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(res.recommendation_text, 125);
        doc.text(lines, margin + 46, y + 6);
        y += Math.max(18, lines.length * 5);
      } else y += 18;
    }

    if (selectedSample.comments) {
      y += 2;
      section('Laboratory Comments');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(selectedSample.comments, 176);
      doc.text(lines, margin, y + 1);
      y += lines.length * 5 + 4;
    }

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated by SmartOil · ${new Date().toLocaleString('ru-RU')} · Confidential`, 105, 292, { align: 'center' });
    doc.line(margin, 289, 195, 289);

    doc.save(`SmartOil_Report_${selectedSample.sample_number}.pdf`);
    setGenerating(false);
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Отчёты PDF</h1>
        <p className="text-slate-500 text-sm mt-0.5">Генерация отчётов по результатам анализа проб масла</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sample list */}
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-2">Выберите пробу</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input className="pl-8 h-8 text-sm" placeholder="Поиск по номеру, клиенту, активу..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="overflow-auto max-h-[500px]">
            {filteredSamples.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">Пробы не найдены</div>
            ) : filteredSamples.map(s => {
              const res = getResult(s.id);
              return (
                <button
                  key={s.id}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedSample?.id === s.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                  onClick={() => setSelectedSample(s)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-medium text-slate-900">{s.sample_number}</p>
                      <p className="text-xs text-slate-500">{getName(clients, s.client_id, 'company_name')} · {getName(assets, s.asset_id, 'asset_name')}</p>
                      <p className="text-xs text-slate-400">{s.sampling_date}</p>
                    </div>
                    <div>{res ? <StatusBadge status={res.overall_status} /> : <span className="text-xs text-slate-400">Без результата</span>}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Предварительный просмотр</p>
            {selectedSample && (
              <Button size="sm" onClick={generatePDF} disabled={generating}>
                <Download className="w-4 h-4 mr-1.5" />{generating ? 'Генерация...' : 'Скачать PDF'}
              </Button>
            )}
          </div>
          {!selectedSample ? (
            <div className="py-20 text-center text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm">Выберите пробу из списка слева</p>
            </div>
          ) : (
            <div className="p-4 space-y-4 overflow-auto max-h-[500px]">
              <div className={`rounded-md p-3 text-sm font-semibold text-center text-white ${selectedResult?.overall_status === 'green' ? 'bg-green-600' : selectedResult?.overall_status === 'yellow' ? 'bg-yellow-500' : selectedResult?.overall_status === 'red' ? 'bg-red-600' : 'bg-slate-500'}`}>
                {selectedResult ? { green: '✓ Норма', yellow: '⚠ Внимание', red: '✗ Критично' }[selectedResult.overall_status] : 'Результат не введён'}
              </div>
              <div className="text-xs space-y-2 text-slate-700">
                <div className="grid grid-cols-2 gap-1">
                  <div><span className="text-slate-400">Проба:</span> <strong>{selectedSample.sample_number}</strong></div>
                  <div><span className="text-slate-400">Дата:</span> <strong>{selectedSample.sampling_date}</strong></div>
                  <div><span className="text-slate-400">Клиент:</span> <strong>{getName(clients, selectedSample.client_id, 'company_name')}</strong></div>
                  <div><span className="text-slate-400">Актив:</span> <strong>{getName(assets, selectedSample.asset_id, 'asset_name')}</strong></div>
                  <div><span className="text-slate-400">Оборудование:</span> <strong>{getName(units, selectedSample.equipment_unit_id, 'unit_name')}</strong></div>
                  <div><span className="text-slate-400">Точка:</span> <strong>{getName(points, selectedSample.sampling_point_id, 'point_name')}</strong></div>
                  <div><span className="text-slate-400">М/ч всего:</span> <strong>{selectedSample.total_hours_at_sampling ?? '—'}</strong></div>
                  <div><span className="text-slate-400">М/ч масла:</span> <strong>{selectedSample.oil_hours_at_sampling ?? '—'}</strong></div>
                </div>
                {selectedResult && (
                  <>
                    <div className="border-t pt-2">
                      <p className="font-semibold text-slate-600 mb-1">Результаты анализа</p>
                      <div className="grid grid-cols-2 gap-1">
                        <div>Fe, мг/л: <strong>{selectedResult.iron_mg_l ?? '—'}</strong></div>
                        <div>H₂O ppm: <strong>{selectedResult.water_ppm ?? '—'}</strong></div>
                        <div>aw: <strong>{selectedResult.water_activity ?? '—'}</strong></div>
                        <div>Вязк. 40°C: <strong>{selectedResult.viscosity_40 ?? '—'}</strong></div>
                        <div>Плотность: <strong>{selectedResult.density ?? '—'}</strong></div>
                        <div>Диэлектр.: <strong>{selectedResult.dielectric_constant ?? '—'}</strong></div>
                      </div>
                    </div>
                    <div className="border-t pt-2">
                      <p className="font-semibold text-slate-600 mb-1">Oil Health Index</p>
                      <div className={`text-3xl font-black ${selectedResult.oil_health_index >= 70 ? 'text-green-600' : selectedResult.oil_health_index >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {selectedResult.oil_health_index ?? '—'}<span className="text-sm font-normal text-slate-400">/100</span>
                      </div>
                      {selectedResult.recommendation_text && (
                        <p className="text-slate-600 mt-1 italic">{selectedResult.recommendation_text}</p>
                      )}
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