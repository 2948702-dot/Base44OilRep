import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ParameterGauge from '@/components/ParameterGauge';

const PARAMETERS = [
  { key: 'iron_mg_l', label: 'Железо (мг/л)', unit: 'мг/л' },
  { key: 'water_ppm', label: 'Вода (ppm)', unit: 'ppm' },
  { key: 'water_activity', label: 'Акт. воды', unit: '' },
  { key: 'viscosity_40', label: 'Вязкость 40°C', unit: 'мм²/с' },
  { key: 'viscosity_100', label: 'Вязкость 100°C', unit: 'мм²/с' },
  { key: 'dielectric_constant', label: 'Диэлектр.', unit: '' },
  { key: 'density', label: 'Плотность', unit: 'кг/м3' },
  { key: 'oil_health_index', label: 'OHI', unit: '%' },
];

export default function EquipmentDetailPage() {
  const { equipmentId } = useParams();
  const navigate = useNavigate();
  const [selectedParam, setSelectedParam] = useState('oil_health_index');
  const [probeCount, setProbeCount] = useState('10');

  const { data: equipment } = useQuery({ 
    queryKey: ['equipment', equipmentId], 
    queryFn: () => base44.entities.EquipmentUnit.list().then(e => e.find(x => x.id === equipmentId))
  });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: samples = [] } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: results = [] } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });

  const N = parseInt(probeCount);
  const equipPoints = points.filter(p => p.equipment_unit_id === equipmentId);
  const equipSamples = samples.filter(s => 
    equipPoints.some(p => p.id === s.sampling_point_id) && s.sample_status === 'completed'
  ).sort((a, b) => new Date(b.sampling_date) - new Date(a.sampling_date));

  // Get last N samples with results
  const lastNSamples = equipSamples
    .filter(s => results.some(r => r.sample_id === s.id))
    .slice(0, N);

  // Build trend chart data
  const trendData = lastNSamples
    .reverse()
    .map(s => {
      const r = results.find(x => x.sample_id === s.id);
      return {
        date: new Date(s.sampling_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        [selectedParam]: r?.[selectedParam],
      };
    });

  // Get latest values for all parameters
  const latestSample = equipSamples[0];
  const latestResult = latestSample ? results.find(r => r.sample_id === latestSample.id) : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{equipment?.unit_name || 'Оборудование'}</h1>
          <p className="text-sm text-slate-500">{equipment?.manufacturer} {equipment?.model}</p>
        </div>
      </div>

      {/* Latest parameters gauges */}
      {latestResult && (
        <>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Последние показатели</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            {PARAMETERS.map(p => (
              <div key={p.key} className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-medium text-slate-600 mb-2">{p.label}</div>
                <div className="text-lg font-bold text-slate-900">
                  {latestResult[p.key] !== null && latestResult[p.key] !== undefined 
                    ? typeof latestResult[p.key] === 'number'
                      ? latestResult[p.key].toFixed(1)
                      : latestResult[p.key]
                    : '—'
                  }
                </div>
                {p.unit && <div className="text-xs text-slate-400">{p.unit}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Trend chart */}
      {trendData.length > 1 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Динамика параметра</h3>
            <div className="flex items-center gap-3">
              <Select value={selectedParam} onValueChange={setSelectedParam}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARAMETERS.map(p => (
                    <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={probeCount} onValueChange={setProbeCount}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['5','10','15','20','30'].map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => v != null ? v.toFixed(2) : '—'} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={selectedParam} 
                stroke="#3b82f6" 
                strokeWidth={2} 
                dot={{ r: 4 }} 
                connectNulls 
                name={PARAMETERS.find(p => p.key === selectedParam)?.label}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {trendData.length <= 1 && (
        <div className="text-center py-10 text-slate-400">
          Недостаточно данных для отображения динамики
        </div>
      )}
    </div>
  );
}