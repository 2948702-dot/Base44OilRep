import { Card } from '@/components/ui/card';
import { getThresholdSeverity, resolveThresholdRule } from '@/utils/thresholdRules';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RankingCard({
  title,
  subtitle,
  param,
  enriched,
  thresholdRules = [],
  getValue,
  getStatusValue,
  format,
  higherIsBetter = true,
  sortByAbsolute = false,
  additionalInfo,
  big = false,
}) {
  const items = enriched.map((item, index) => ({
    ...item,
    value: getValue(item),
    originalIndex: index,
  }));

  const withValue = items.filter(item => item.value !== null && item.value !== undefined);
  const withoutValue = items.filter(item => item.value === null || item.value === undefined);

  withValue.sort((a, b) => {
    const aVal = sortByAbsolute ? Math.abs(a.value) : a.value;
    const bVal = sortByAbsolute ? Math.abs(b.value) : b.value;
    return higherIsBetter ? bVal - aVal : aVal - bVal;
  });

  const sorted = [...withValue, ...withoutValue];

  return (
    <Card className={`${big ? 'p-5' : 'p-4'} rounded-lg shadow-sm`}>
      <div className="mb-3">
        <h3 className={big ? 'text-lg font-semibold text-slate-900' : 'text-sm font-semibold text-slate-900'}>{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-1.5">
        {sorted.map((item, index) => {
          const status = getStatus(item, param, thresholdRules, getStatusValue || getValue);
          const medal = index < 3 && item.value !== null && item.value !== undefined ? MEDALS[index] : '';
          const info = additionalInfo?.(item);

          return (
            <div key={item.sample.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-6 text-base leading-none">{medal}</span>
                <span className="truncate text-slate-800">
                  {item.unit?.unit_name || '—'}
                  <span className="ml-1 text-slate-400">({item.sample.sample_number})</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {info && <span className="text-xs text-slate-400">{info}</span>}
                <span className="min-w-14 text-right font-medium tabular-nums text-slate-900">{format(item.value)}</span>
                <StatusDot status={status} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function getStatus(item, param, thresholdRules, getStatusValue) {
  const value = getStatusValue(item);
  if (value === null || value === undefined) return null;

  const oilTypeId = item.sample.oil_type_id || item.unit?.current_oil_type_id || item.unit?.oil_type_id;
  const rule = resolveThresholdRule(thresholdRules, param, oilTypeId, item.unit);
  return getThresholdSeverity(rule, value);
}

function StatusDot({ status }) {
  if (status === 'green') {
    return <div className="h-2 w-2 rounded-full bg-emerald-500" title="В пределах нормы" />;
  }
  if (status === 'yellow') {
    return <div className="h-2 w-2 rounded-full bg-amber-500" title="Внимание — приближается к пределу" />;
  }
  if (status === 'red') {
    return <div className="h-2 w-2 rounded-full bg-rose-500" title="Превышен допустимый предел" />;
  }
  return (
    <div
      className="h-2 w-2 rounded-full border border-slate-300 bg-slate-200"
      title="Не задан порог для этой пробы — задайте правила в справочнике масла или индивидуальные пороги агрегата"
    />
  );
}
