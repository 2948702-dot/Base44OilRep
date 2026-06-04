import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CompareDashboard from '@/components/CompareDashboard';
import CompareChartsView from '@/components/CompareChartsView';

export default function CompareSamples() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState('rankings');
  const ids = useMemo(() => (params.get('ids') || '').split(',').filter(Boolean), [params]);

  const { data: samples = [], isLoading: samplesLoading } = useQuery({
    queryKey: ['compare-samples', ids],
    queryFn: async () => {
      if (!ids.length) return [];
      const all = await base44.entities.OilSample.list();
      return all.filter(sample => ids.includes(sample.id));
    },
  });

  const { data: analyses = [] } = useQuery({
    queryKey: ['compare-analyses', ids],
    queryFn: async () => {
      if (!ids.length) return [];
      const all = await base44.entities.AnalysisResult.list();
      return all.filter(analysis => ids.includes(analysis.sample_id));
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ['compare-units'],
    queryFn: () => base44.entities.EquipmentUnit.list(),
  });

  const { data: oils = [] } = useQuery({
    queryKey: ['compare-oils'],
    queryFn: () => base44.entities.OilReference.list(),
  });

  const { data: thresholdRules = [] } = useQuery({
    queryKey: ['compare-thresholds'],
    queryFn: () => base44.entities.ThresholdRule.list(),
  });

  const enriched = samples.map(sample => {
    const analysis = analyses.find(item => item.sample_id === sample.id) || {};
    const unit = units.find(item => item.id === sample.equipment_unit_id);
    const oilTypeId = sample.oil_type_id || unit?.current_oil_type_id || unit?.oil_type_id;
    const oil = oils.find(item => item.id === oilTypeId);
    const deviationVisc = oil?.passport_viscosity_40 && analysis.viscosity_40
      ? ((analysis.viscosity_40 - oil.passport_viscosity_40) / oil.passport_viscosity_40) * 100
      : null;
    const deviationDens = oil?.passport_density_15 && analysis.density
      ? ((analysis.density - oil.passport_density_15) / oil.passport_density_15) * 100
      : null;

    return { sample, analysis, unit, oil, deviationVisc, deviationDens };
  });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Сравнение проб</h1>
          <p className="text-sm text-slate-500">Выбрано: {samples.length}</p>
        </div>
      </div>

      {samplesLoading ? (
        <div className="py-12 text-center text-slate-400">Загрузка...</div>
      ) : samples.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          Нет проб для сравнения. Вернитесь к списку и выберите пробы чекбоксами.
        </div>
      ) : (
        <Tabs value={view} onValueChange={setView} className="space-y-5">
          <TabsList>
            <TabsTrigger value="rankings">Рейтинги</TabsTrigger>
            <TabsTrigger value="charts">Диаграммы</TabsTrigger>
          </TabsList>
          <TabsContent value="rankings" className="mt-0">
            <CompareDashboard enriched={enriched} thresholdRules={thresholdRules} />
          </TabsContent>
          <TabsContent value="charts" className="mt-0">
            <CompareChartsView enriched={enriched} thresholdRules={thresholdRules} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
