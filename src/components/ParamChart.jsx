import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { getThresholdSeverity, resolveThresholdRule } from '@/utils/thresholdRules';

const STATUS_COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  gray: '#cbd5e1',
};

const RANGE_COLORS = {
  green: STATUS_COLORS.green,
  yellow: STATUS_COLORS.yellow,
  red: STATUS_COLORS.red,
};

const RANGE_FIELDS = [
  ['green_min', 'green'],
  ['green_max', 'green'],
  ['yellow_min', 'yellow'],
  ['yellow_max', 'yellow'],
  ['red_min', 'red'],
  ['red_max', 'red'],
];

export default function ParamChart({ paramConfig, enriched, thresholdRules }) {
  const { key: param, title, subtitle, format } = paramConfig;

  const data = enriched
    .map(item => {
      const value = getParamValue(item, param);
      const oilTypeId = item.sample.oil_type_id || item.unit?.current_oil_type_id || item.unit?.oil_type_id;
      const rule = resolveThresholdRule(thresholdRules, param, oilTypeId, item.unit);
      const status = value != null && rule ? getThresholdSeverity(rule, value) : null;

      return {
        name: item.unit?.unit_name || '—',
        sampleNumber: item.sample.sample_number,
        value,
        status,
        ruleId: rule?.id || rule?.source || null,
        rule,
      };
    })
    .filter(item => item.value !== null && item.value !== undefined);

  const ruleIds = [...new Set(data.map(item => item.ruleId).filter(Boolean))];
  const commonRule = ruleIds.length === 1 ? data.find(item => item.ruleId === ruleIds[0])?.rule : null;
  const showLines = Boolean(commonRule && data.length > 0 && data.every(item => item.ruleId === ruleIds[0]));
  const noRules = data.length > 0 && ruleIds.length === 0;

  return (
    <Card className="rounded-lg p-4 shadow-sm">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-400">
          Нет данных
        </div>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 46 }}>
                <XAxis
                  dataKey="name"
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  tick={{ fontSize: 11 }}
                  height={58}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={value => [format(value), title]}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    return `${label} (${item?.sampleNumber || '—'})`;
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.map((item, index) => (
                    <Cell key={`${item.sampleNumber}-${index}`} fill={STATUS_COLORS[item.status] || STATUS_COLORS.gray} />
                  ))}
                </Bar>
                {showLines && renderThresholdLines(commonRule)}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {!showLines && (
            <p className="mt-1 text-xs text-slate-400">
              {noRules
                ? 'Пороговые линии не показаны: для этого параметра не заданы пороги.'
                : 'Пороговые линии не показаны: пробы относятся к разным правилам.'}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function getParamValue(item, param) {
  if (param === 'oil_health_index') return item.analysis?.oil_health_index ?? null;
  return item.analysis?.[param] ?? null;
}

function renderThresholdLines(rule) {
  const lines = rule.custom_ranges_mode && Array.isArray(rule.ranges)
    ? collectCustomRangeLines(rule.ranges)
    : collectFixedRangeLines(rule);

  return lines.map(line => (
    <ReferenceLine
      key={`${line.y}-${line.color}`}
      y={line.y}
      stroke={line.color}
      strokeDasharray="3 3"
      ifOverflow="extendDomain"
    />
  ));
}

function collectFixedRangeLines(rule) {
  const byValue = new Map();

  RANGE_FIELDS.forEach(([field, severity]) => {
    if (!hasNumber(rule[field])) return;
    const value = Number(rule[field]);
    if (!byValue.has(value)) {
      byValue.set(value, { y: value, color: RANGE_COLORS[severity] });
    }
  });

  return [...byValue.values()].sort((a, b) => a.y - b.y);
}

function collectCustomRangeLines(ranges) {
  const byValue = new Map();

  ranges.forEach(range => {
    const color = range.color || STATUS_COLORS.gray;
    ['min', 'max'].forEach(field => {
      if (!hasNumber(range[field])) return;
      const value = Number(range[field]);
      if (!byValue.has(value)) {
        byValue.set(value, { y: value, color });
      }
    });
  });

  return [...byValue.values()].sort((a, b) => a.y - b.y);
}

function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}
