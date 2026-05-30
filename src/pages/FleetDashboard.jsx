import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import OHIGauge from '@/components/OHIGauge';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function statusColor(ohi) {
  if (ohi == null) return 'border-slate-200 bg-white';
  if (ohi >= 70) return 'border-green-200 bg-green-50';
  if (ohi >= 40) return 'border-yellow-200 bg-yellow-50';
  return 'border-red-200 bg-red-50';
}

function statusLabel(ohi) {
  if (ohi == null) return { text: 'Нет данных', cls: 'text-slate-400' };
  if (ohi >= 70) return { text: 'Норма', cls: 'text-green-600' };
  if (ohi >= 40) return { text: 'Внимание', cls: 'text-yellow-600' };
  return { text: 'Критично', cls: 'text-red-600' };
}

export default function FleetDashboard() {
  const navigate = useNavigate();
  const [selectedClientId, setSelectedClientId] = useState(null);

  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: samples = [] } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: results = [] } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });

  // For each asset, find latest OHI across all its sampling points
  const assetOHI = assets.map(asset => {
    const assetPoints = points.filter(p => p.asset_id === asset.id);
    const assetSamples = samples.filter(s => s.asset_id === asset.id && s.sample_status === 'completed');

    let latestOHI = null;
    let latestDate = null;
    let sampleCount = 0;

    for (const point of assetPoints) {
      const pointSamples = assetSamples
        .filter(s => s.sampling_point_id === point.id)
        .sort((a, b) => new Date(b.sampling_date) - new Date(a.sampling_date));
      sampleCount += pointSamples.length;

      for (const s of pointSamples) {
        const res = results.find(r => r.sample_id === s.id);
        if (res?.oil_health_index != null) {
          if (!latestDate || new Date(s.sampling_date) > new Date(latestDate)) {
            latestOHI = res.oil_health_index;
            latestDate = s.sampling_date;
          }
          break;
        }
      }
    }

    const client = clients.find(c => c.id === asset.client_id);
    return { ...asset, ohi: latestOHI, latestDate, sampleCount, clientName: client?.company_name };
  });

  // Filter by selected client
  const filtered = selectedClientId ? assetOHI.filter(a => a.client_id === selectedClientId) : assetOHI;
  
  const total = filtered.length;
  const withData = filtered.filter(a => a.ohi != null).length;
  const avgOHI = withData > 0 ? Math.round(filtered.filter(a => a.ohi != null).reduce((s, a) => s + a.ohi, 0) / withData) : null;
  const critical = filtered.filter(a => a.ohi != null && a.ohi < 40).length;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Дашборд флота</h1>
          <p className="text-slate-500 text-sm mt-0.5">Состояние масла по всем судам — нажмите на судно для детализации</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Фильтр по клиенту:</span>
          <Select value={selectedClientId || ''} onValueChange={(v) => setSelectedClientId(v || null)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Все клиенты" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Все клиенты</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Всего судов', value: total, cls: 'text-slate-800' },
          { label: 'С данными анализа', value: withData, cls: 'text-blue-600' },
          { label: 'Средний OHI', value: avgOHI != null ? avgOHI : '—', cls: avgOHI >= 70 ? 'text-green-600' : avgOHI >= 40 ? 'text-yellow-600' : 'text-red-600' },
          { label: 'Критичных судов', value: critical, cls: critical > 0 ? 'text-red-600' : 'text-slate-400' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Fleet grid */}
      {assetOHI.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-lg font-medium mb-1">Суда не найдены</p>
          <p className="text-sm">Добавьте активы в разделе «Активы»</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {assetOHI.map(asset => {
            const sl = statusLabel(asset.ohi);
            return (
              <button
                key={asset.id}
                onClick={() => navigate(`/vessel/${asset.id}`)}
                className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all hover:shadow-md hover:scale-105 cursor-pointer w-44 ${statusColor(asset.ohi)}`}
              >
                <OHIGauge value={asset.ohi} size={110} label={asset.asset_name} />
                <p className={`text-xs font-semibold mt-1 ${sl.cls}`}>{sl.text}</p>
                {asset.latestDate && <p className="text-[10px] text-slate-400 mt-0.5">{ new Date(asset.latestDate).toLocaleDateString('ru-RU') }</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}