import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Search, CheckCircle2, FlaskConical, ChevronRight, ChevronLeft } from 'lucide-react';
import QRScanner from '@/components/mobile/QRScanner';
import { getThresholdSeverity, resolveThresholdRule } from '@/utils/thresholdRules';

const PARAMS = [
  { key: 'iron_mg_l', label: 'Железо', unit: 'мг/л' },
  { key: 'water_ppm', label: 'Вода', unit: 'ppm' },
  { key: 'water_activity', label: 'Активность воды', unit: '%' },
  { key: 'viscosity_40', label: 'Вязкость 40°C', unit: 'мм²/с' },
  { key: 'density', label: 'Плотность', unit: 'кг/м³' },
  { key: 'dielectric_constant', label: 'Диэлектр. константа', unit: '' },
];

function StatusDot({ value, rule }) {
  if (value === '' || value === null || value === undefined || !rule) return null;
  const severity = getThresholdSeverity(rule, value);
  let color = 'bg-slate-300';
  if (severity === 'green') color = 'bg-green-500';
  else if (severity === 'yellow') color = 'bg-yellow-400';
  else if (severity === 'red') color = 'bg-red-500';
  return <span className={`w-3 h-3 rounded-full ${color} flex-shrink-0 mt-1`} />;
}

export default function MobileLab() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0); // 0=search, 1=form, 2=done
  const [scanner, setScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sample, setSample] = useState(null);
  const [results, setResults] = useState({});
  const [recommendation, setRecommendation] = useState('');

  const { data: allSamples = [] } = useQuery({
    queryKey: ['oil-samples'],
    queryFn: () => base44.entities.OilSample.list()
  });
  const { data: thresholds = [] } = useQuery({
    queryKey: ['threshold-rules'],
    queryFn: () => base44.entities.ThresholdRule.list()
  });
  const { data: equipmentUnits = [] } = useQuery({
    queryKey: ['equipment-units'],
    queryFn: () => base44.entities.EquipmentUnit.list()
  });

  const pendingSamples = allSamples.filter(s => s.sample_status === 'pending' || s.sample_status === 'in_analysis');

  const handleScan = (data) => {
    setScanner(false);
    const found = allSamples.find(s => s.can_qr_code === data || s.sample_number === data);
    if (found) { selectSample(found); }
    else alert('Проба с таким кодом не найдена');
  };

  const selectSample = async (s) => {
    setSample(s);
    if (s.sample_status === 'pending') {
      await base44.entities.OilSample.update(s.id, { sample_status: 'in_analysis' });
      qc.invalidateQueries({ queryKey: ['oil-samples'] });
    }
    setStep(1);
  };

  const saveResults = useMutation({
    mutationFn: async () => {
      const numericResults = {};
      Object.entries(results).forEach(([k, v]) => {
        if (v !== '') numericResults[k] = Number(v);
      });
      const unit = equipmentUnits.find(u => u.id === sample.equipment_unit_id);
      const oilTypeId = sample.oil_type_id || unit?.current_oil_type_id || unit?.oil_type_id;
      // Determine status
      let overall = 'green';
      PARAMS.forEach(({ key }) => {
        if (numericResults[key] === null || numericResults[key] === undefined || Number.isNaN(numericResults[key])) return;
        const rule = resolveThresholdRule(thresholds, key, oilTypeId, unit);
        if (!rule) return;
        const severity = getThresholdSeverity(rule, numericResults[key]);
        if (severity === 'red') overall = 'red';
        else if (overall !== 'red' && severity === 'yellow') overall = 'yellow';
      });
      // Upsert: update existing result if any, create otherwise
      const existing = await base44.entities.AnalysisResult.filter({ sample_id: sample.id });
      const resultData = { sample_id: sample.id, ...numericResults, recommendation_text: recommendation, overall_status: overall };
      if (existing.length > 0) {
        await base44.entities.AnalysisResult.update(existing[0].id, resultData);
      } else {
        await base44.entities.AnalysisResult.create(resultData);
      }
      await base44.entities.OilSample.update(sample.id, { sample_status: 'completed' });
      qc.invalidateQueries({ queryKey: ['oil-samples'] });
      qc.invalidateQueries({ queryKey: ['analysis-results'] });
    },
    onSuccess: () => setStep(2),
  });

  const getUnitName = (id) => equipmentUnits.find(u => u.id === id)?.unit_name || '';
  const selectedUnit = sample ? equipmentUnits.find(u => u.id === sample.equipment_unit_id) : null;
  const selectedOilTypeId = sample?.oil_type_id || selectedUnit?.current_oil_type_id || selectedUnit?.oil_type_id;

  const filtered = pendingSamples.filter(s =>
    s.sample_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.can_qr_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
      {scanner && <QRScanner label="Сканируйте QR банки с пробой" onScan={handleScan} onClose={() => setScanner(false)} />}

      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-purple-400" />
          <h1 className="font-bold text-lg">Ввод результатов</h1>
        </div>
        <p className="text-slate-400 text-xs mt-0.5">Лабораторный анализ масла</p>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">

        {/* Step 0: Search */}
        {step === 0 && (
          <div className="space-y-4">
            <Button className="w-full h-14 text-base gap-3" onClick={() => setScanner(true)}>
              <Camera className="w-5 h-5" />
              Сканировать QR банки
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300" /></div>
              <div className="relative flex justify-center text-sm"><span className="bg-slate-50 px-3 text-slate-500">или поиск по номеру</span></div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-9 h-12 text-base" placeholder="Номер пробы..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            {(searchQuery || pendingSamples.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  {searchQuery ? `Результаты (${filtered.length})` : `Ожидают анализа (${pendingSamples.length})`}
                </p>
                {(searchQuery ? filtered : pendingSamples).map(s => (
                  <button key={s.id} className="w-full text-left bg-white rounded-xl p-4 border border-slate-200 hover:border-purple-300 active:bg-purple-50"
                    onClick={() => selectSample(s)}>
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900 font-mono">{s.sample_number}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.sample_status === 'in_analysis' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                        {s.sample_status === 'in_analysis' ? 'В анализе' : 'Ожидает'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{getUnitName(s.equipment_unit_id)} · {s.sampling_date}</p>
                    {s.can_qr_code && <p className="text-xs text-slate-400 mt-0.5">QR: {s.can_qr_code.slice(0, 20)}…</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Results form */}
        {step === 1 && sample && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-xs text-purple-600 font-medium uppercase tracking-wide mb-1">Проба</p>
              <p className="font-bold text-purple-900 font-mono text-lg">{sample.sample_number}</p>
              <p className="text-sm text-purple-700">{getUnitName(sample.equipment_unit_id)}</p>
              <p className="text-xs text-purple-500">{sample.sampling_date}</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-700">Параметры анализа</p>
                <p className="text-xs text-slate-500 mt-0.5">Цветная точка = соответствие нормам</p>
              </div>
              <div className="divide-y divide-slate-100">
                {PARAMS.map(({ key, label, unit }) => (
                  <div key={key} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{label}</p>
                      {unit && <p className="text-xs text-slate-400">{unit}</p>}
                    </div>
                    <StatusDot value={results[key]} rule={resolveThresholdRule(thresholds, key, selectedOilTypeId, selectedUnit)} />
                    <Input
                      className="w-28 h-10 text-right text-base"
                      inputMode="decimal"
                      placeholder="—"
                      value={results[key] || ''}
                      onChange={e => setResults(p => ({ ...p, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <Label className="text-sm font-semibold">Рекомендации</Label>
              <Textarea rows={4} placeholder="Введите рекомендации по результатам анализа..." value={recommendation} onChange={e => setRecommendation(e.target.value)} />
            </div>

            <Button className="w-full h-14 text-base" onClick={() => saveResults.mutate()} disabled={saveResults.isPending}>
              {saveResults.isPending ? 'Сохранение...' : 'Сохранить результаты'}
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(0)}>
              <ChevronLeft className="w-4 h-4 mr-1" />Назад
            </Button>
          </div>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <CheckCircle2 className="w-20 h-20 text-green-500" />
            <h2 className="text-2xl font-bold text-slate-900">Результаты сохранены!</h2>
            <p className="text-slate-500">Проба <span className="font-mono font-bold text-slate-800">{sample?.sample_number}</span> завершена</p>
            <Button className="w-full h-14 text-base mt-4" onClick={() => { setSample(null); setResults({}); setRecommendation(''); setStep(0); }}>
              Следующая проба
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
