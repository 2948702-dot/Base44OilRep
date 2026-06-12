import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import OHIGauge from '@/components/OHIGauge';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CRITICAL_THRESHOLD = 40;

export default function CriticalVessels() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: samples = [] } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: results = [] } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });
  const { data: schedules = [] } = useQuery({ queryKey: ['maintenance-schedules'], queryFn: () => base44.entities.MaintenanceSchedule.list() });

  const vesselHealth = assets.map(asset => {
    const assetUnits = units.filter(unit => unit.asset_id === asset.id);
    const assetSamples = samples.filter(s => s.asset_id === asset.id && s.sample_status === 'completed');

    const unitOHIs = assetUnits.map(unit => {
      const latestSample = assetSamples
        .filter(s => s.equipment_unit_id === unit.id)
        .sort((a, b) => new Date(b.sampling_date) - new Date(a.sampling_date))[0];
      
      const result = latestSample ? results.find(r => r.sample_id === latestSample.id) : null;
      return result?.oil_health_index ?? null;
    });

    const validOHIs = unitOHIs.filter(ohi => ohi !== null);
    const worstOHI = validOHIs.length > 0 ? Math.min(...validOHIs) : null;
    const avgOHI = validOHIs.length > 0 ? Math.round(validOHIs.reduce((a, b) => a + b) / validOHIs.length) : null;

    const overdueSchedules = schedules.filter(s => s.asset_id === asset.id && s.status === 'overdue');

    return {
      asset,
      worstOHI,
      avgOHI,
      unitCount: assetUnits.length,
      sampleCount: assetSamples.length,
      hasOverdueSchedules: overdueSchedules.length > 0,
      overdueCount: overdueSchedules.length,
      isCritical: worstOHI !== null && worstOHI < CRITICAL_THRESHOLD,
      isWarning: worstOHI !== null && worstOHI >= CRITICAL_THRESHOLD && worstOHI < 60,
    };
  });

  let filtered = vesselHealth;
  if (filterStatus === 'critical') {
    filtered = filtered.filter(v => v.isCritical);
  } else if (filterStatus === 'warning') {
    filtered = filtered.filter(v => v.isWarning);
  } else {
    filtered = filtered.filter(v => v.isCritical || v.isWarning);
  }

  filtered.sort((a, b) => (a.worstOHI ?? 100) - (b.worstOHI ?? 100));

  if (filtered.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Критические суда</h1>
        <div className="text-center py-20 text-slate-400">
          Нет судов в критическом состоянии
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="w-6 h-6 text-red-600" />
        <h1 className="text-2xl font-bold text-slate-900">Критические суда</h1>
      </div>

      <div className="mb-6">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все критические и предупреждения</SelectItem>
            <SelectItem value="critical">Только критические (OHI &lt; 40)</SelectItem>
            <SelectItem value="warning">Только предупреждения (OHI 40-60)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {filtered.map(({ asset, worstOHI, avgOHI, unitCount, sampleCount, hasOverdueSchedules, overdueCount, isCritical }) => {
          const client = clients.find(c => c.id === asset.client_id);
          return (
            <div key={asset.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <OHIGauge value={worstOHI} size={100} />
                
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{asset.asset_name}</h3>
                      <p className="text-sm text-slate-500">{client?.company_name}</p>
                      <p className="text-xs text-slate-400 mt-2">
                        {unitCount} агрегатов · {sampleCount} проб
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">
                        Худший OHI: <span className={isCritical ? 'text-red-600 font-bold' : 'text-yellow-600 font-bold'}>
                          {worstOHI !== null ? Math.round(worstOHI) : '—'}
                        </span>
                      </p>
                      <p className="text-sm text-slate-600">
                        Средний OHI: <span className="font-semibold">{avgOHI ?? '—'}</span>
                      </p>
                      {hasOverdueSchedules && (
                        <p className="text-xs text-red-600 font-semibold mt-1">
                          ⚠️ {overdueCount} просроченных обслуживаний
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => navigate(`/vessel/${asset.id}`)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
