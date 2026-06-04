import RankingCard from '@/components/RankingCard';

export default function CompareDashboard({ enriched, thresholdRules }) {
  return (
    <div className="space-y-6">
      <RankingCard
        title="Общий индекс здоровья масла (OHI)"
        subtitle="больше = лучше"
        param="oil_health_index"
        enriched={enriched}
        thresholdRules={thresholdRules}
        getValue={item => item.analysis.oil_health_index}
        format={value => value != null ? Math.round(value) : '—'}
        higherIsBetter
        big
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <RankingCard
          title="Железо"
          subtitle="мг/л · меньше = лучше"
          param="iron_mg_l"
          enriched={enriched}
          thresholdRules={thresholdRules}
          getValue={item => item.analysis.iron_mg_l}
          format={value => value != null ? value.toFixed(1) : '—'}
          higherIsBetter={false}
        />
        <RankingCard
          title="Вода"
          subtitle="ppm · меньше = лучше"
          param="water_ppm"
          enriched={enriched}
          thresholdRules={thresholdRules}
          getValue={item => item.analysis.water_ppm}
          format={value => value != null ? Math.round(value) : '—'}
          higherIsBetter={false}
        />
        <RankingCard
          title="Активная вода"
          subtitle="% · меньше = лучше"
          param="water_activity"
          enriched={enriched}
          thresholdRules={thresholdRules}
          getValue={item => item.analysis.water_activity}
          format={value => value != null ? value.toFixed(1) : '—'}
          higherIsBetter={false}
        />
        <RankingCard
          title="Вязкость при 40°C"
          subtitle="отклонение от паспорта · ближе к 0 = лучше"
          param="viscosity_40"
          enriched={enriched}
          thresholdRules={thresholdRules}
          getValue={item => item.deviationVisc}
          getStatusValue={item => item.analysis.viscosity_40}
          format={value => value != null ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : '—'}
          sortByAbsolute
          additionalInfo={item => item.analysis.viscosity_40 ? `${item.analysis.viscosity_40.toFixed(1)} cSt` : null}
        />
        <RankingCard
          title="Плотность 15°C"
          subtitle="отклонение от паспорта · ближе к 0 = лучше"
          param="density"
          enriched={enriched}
          thresholdRules={thresholdRules}
          getValue={item => item.deviationDens}
          getStatusValue={item => item.analysis.density}
          format={value => value != null ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—'}
          sortByAbsolute
          additionalInfo={item => item.analysis.density ? `${item.analysis.density.toFixed(0)} кг/м³` : null}
        />
        <RankingCard
          title="Диэлектрика"
          subtitle="меньше = лучше"
          param="dielectric_constant"
          enriched={enriched}
          thresholdRules={thresholdRules}
          getValue={item => item.analysis.dielectric_constant}
          format={value => value != null ? value.toFixed(2) : '—'}
          higherIsBetter={false}
        />
      </div>
    </div>
  );
}
