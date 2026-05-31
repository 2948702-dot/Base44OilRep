import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import OHIGauge from '@/components/OHIGauge';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import ParameterGauge from '@/components/ParameterGauge';
import MaintenanceOverdueIndicator from '@/components/MaintenanceOverdueIndicator';

const TREND_PARAMS = [
  { key: 'oil_health_index', label: 'OHI', color: '#3b82f6', result: true },
  { key: 'iron_mg_l', label: 'Железо (мг/л)', color: '#ef4444', result: true },
  { key: 'water_ppm', label: 'Вода (ppm)', color: '#06b6d4', result: true },
  { key: 'viscosity_40', label: 'Вязкость 40°C', color: '#8b5cf6', result: true },
  { key: 'water_activity', label: 'Акт. воды', color: '#f59e0b', result: true },
  { key: 'dielectric_constant', label: 'Диэлектр.', color: '#10b981', result: true },
];

const GAUGES = [
  {
    key: 'iron_mg_l', label: 'Железо', unit: 'мг/л', min: 0, max: 200, decimals: 1,
    zones: [{from:0,to:0.25,color:'#22c55e'},{from:0.25,to:0.5,color:'#eab308'},{from:0.5,to:1,color:'#ef4444'}]
  },
  {
    key: 'water_ppm', label: 'Вода', unit: 'ppm', min: 0, max: 1000, decimals: 0,
    zones: [{from:0,to:0.2,color:'#22c55e'},{from:0.2,to:0.5,color:'#eab308'},{from:0.5,to:1,color:'#ef4444'}]
  },
  {
    key: 'water_activity', label: 'Акт. воды', unit: '', min: 0, max: 1.0, decimals: 3,
    zones: [{from:0,to:0.4,color:'#22c55e'},{from:0.4,to:0.6,color:'#eab308'},{from:0.6,to:1,color:'#ef4444'}]
  },
  {
    key: 'viscosity_40', label: 'Вязкость 40°C', unit: 'мм²/с', min: 0, max: 150, decimals: 1,
    zones: [{from:0,to:0.267,color:'#ef4444'},{from:0.267,to:0.467,color:'#eab308'},{from:0.467,to:0.733,color:'#22c55e'},{from:0.733,to:0.933,color:'#eab308'},{from:0.933,to:1,color:'#ef4444'}]
  },
  {
    key: 'dielectric_constant', label: 'Диэлектр.', unit: '', min: 1.5, max: 4.5, decimals: 2,
    zones: [{from:0,to:0.33,color:'#ef4444'},{from:0.33,to:0.6,color:'#eab308'},{from:0.6,to:1,color:'#22c55e'}]
  },
  {
    key: 'wear_index', label: 'Индекс износа', unit: '', min: 0, max: 100, decimals: 1,
    zones: [{from:0,to:0.4,color:'#22c55e'},{from:0.4,to:0.7,color:'#eab308'},{from:0.7,to:1,color:'#ef4444'}]
  },
];

function ohiColor(v) {
  if (v == null) return 'text-slate-400';
  if (v >= 70) return 'text-green-600';
  if (v >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

export default function VesselDashboard() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const [probeCount, setProbeCount] = useState('10');

  const { data: asset } = useQuery({ queryKey: ['asset', assetId], queryFn: () => base44.entities.Asset.list().then(a => a.find(x => x.id === assetId)) });
  const { data: client } = useQuery({
    queryKey: ['client-for-asset', asset?.client_id],
    queryFn: () => base44.entities.Client.list().then(a => a.find(x => x.id === asset?.client_id)),
    enabled: !!asset?.client_id
  });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: equipment = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: samples = [] } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: results = [] } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: schedules = [] } = useQuery({ queryKey: ['maintenance-schedules'], queryFn: () => base44.entities.MaintenanceSchedule.list() });

  const N = parseInt(probeCount);

  const assetPoints = points.filter(p => p.asset_id === assetId);
  const assetSamples = samples.filter(s => s.asset_id === assetId && s.sample_status === 'completed');
  const assetSchedules = schedules.filter(s => s.asset_id === assetId);

  // Build per-point data
  const pointData = assetPoints.map(point => {
    const eq = equipment.find(e => e.id === point.equipment_unit_id);
    const ptSamples = assetSamples
      .filter(s => s.sampling_point_id === point.id)
      .sort((a, b) => new Date(b.sampling_date) - new Date(a.sampling_date));

    const lastN = ptSamples.slice(0, N);
    const latestSample = ptSamples[0];
    const latestResult = latestSample ? results.find(r => r.sample_id === latestSample.id) : null;

    // Trend data (chronological) - include only samples with results
    const trendData = lastN
      .filter(s => results.some(r => r.sample_id === s.id))
      .reverse()
      .map(s => {
        const r = results.find(x => x.sample_id === s.id);
        return {
          date: new Date(s.sampling_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
          oil_health_index: r?.oil_health_index,
          iron_mg_l: r?.iron_mg_l,
          water_ppm: r?.water_ppm,
          viscosity_40: r?.viscosity_40,
          water_activity: r?.water_activity,
          dielectric_constant: r?.dielectric_constant,
        };
      });

    const oil = oils.find(o => o.id === (eq?.oil_type_id || point.oil_type_id));
    const oilName = eq?.oil_brand || oil?.oil_name || null;

    return { point, eq, latestResult, latestSample, trendData, sampleCount: ptSamples.length, oil, oilName };
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => navigate('/fleet')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{asset?.asset_name || '...'}</h1>
          <p className="text-slate-500 text-sm">{client?.company_name} · {asset?.registration_number} · {assetPoints.length} точек отбора</p>
          <MaintenanceOverdueIndicator schedules={assetSchedules} />
          </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Показывать последних проб:</span>
          <Select value={probeCount} onValueChange={setProbeCount}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['5','10','15','20','30'].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {pointData.length === 0 ? (
        <div className="text-center py-20 text-slate-400">Нет точек отбора для этого судна</div>
      ) : (
        <div className="space-y-6">
          {pointData.map(({ point, eq, latestResult: res, latestSample, trendData, sampleCount, oil, oilName }) => (
            <div key={point.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Point header */}
              <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
                <OHIGauge value={res?.oil_health_index} size={80} />
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 text-base">{point.point_name}</p>
                  <p className="text-xs text-slate-500">{eq?.unit_name} · {eq?.equipment_type} · {oilName || 'Масло не задано'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Всего проб: {sampleCount} · Последняя: {latestSample ? new Date(latestSample.sampling_date).toLocaleDateString('ru-RU') : '—'}</p>
                </div>
                {eq && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate(`/equipment/${eq.id}`)}
                    className="text-xs"
                  >
                    Детали
                  </Button>
                )}
                {res && (
                  <div className="text-right">
                    <p className={`text-3xl font-bold ${ohiColor(res.oil_health_index)}`}>{res.oil_health_index != null ? Math.round(res.oil_health_index) : '—'}</p>
                    <p className="text-xs text-slate-400">Oil Health Index</p>
                  </div>
                )}
              </div>

              {/* Static indicators */}
              {res ? (
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Последние показатели</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 mb-5">
                    {GAUGES.map(g => (
                      <div key={g.key} className="bg-slate-50 rounded-xl border border-slate-100 px-2 py-2">
                        <ParameterGauge
                          label={g.label}
                          unit={g.unit}
                          value={res[g.key] != null ? res[g.key] : null}
                          min={g.min}
                          max={g.max}
                          zones={g.zones}
                          decimals={g.decimals}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Trend chart */}
                  {trendData.length > 1 ? (
                    <>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Динамика — последние {N} проб</p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* OHI trend */}
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Oil Health Index</p>
                          <ResponsiveContainer width="100%" height={140}>
                            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                              <Tooltip formatter={(v) => v != null ? v.toFixed(1) : '—'} />
                              <Line type="monotone" dataKey="oil_health_index" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls name="OHI" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Physical params trend */}
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Физические параметры</p>
                          <ResponsiveContainer width="100%" height={140}>
                            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                              <YAxis tick={{ fontSize: 9 }} />
                              <Tooltip formatter={(v) => v != null ? v.toFixed(2) : '—'} />
                              <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                              <Line type="monotone" dataKey="iron_mg_l" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} connectNulls name="Fe мг/л" />
                              <Line type="monotone" dataKey="viscosity_40" stroke="#8b5cf6" strokeWidth={1.5} dot={{ r: 2 }} connectNulls name="Вязк." />
                              <Line type="monotone" dataKey="dielectric_constant" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} connectNulls name="Диэл." />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  ) : trendData.length === 1 ? (
                    <p className="text-xs text-slate-400">Недостаточно проб для отображения динамики (нужно минимум 2)</p>
                  ) : null}

                  {/* Recommendation */}
                  {res.recommendation_text && (
                    <div className="mt-4 bg-blue-50 rounded-lg px-4 py-2.5">
                      <p className="text-xs font-semibold text-blue-700 mb-0.5">Рекомендация</p>
                      <p className="text-sm text-blue-900">{res.recommendation_text}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-5 py-6 text-sm text-slate-400">Нет результатов анализа для этой точки отбора</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}