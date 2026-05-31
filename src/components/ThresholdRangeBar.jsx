/**
 * Visual horizontal bar showing threshold zones.
 * Supports two modes:
 *  1. ranges: array of { min, max, color, label } for custom segments
 *  2. greenMin/greenMax/yellowMin/yellowMax/redMin/redMax for 3-zone mode
 */
export default function ThresholdRangeBar({
  ranges,
  greenMin,
  greenMax,
  yellowMin,
  yellowMax,
  redMin,
  redMax,
  compact = false,
  showLabels = false,
}) {
  const h = compact ? 8 : 14;
  const labelClass = compact ? 'text-[10px]' : 'text-xs';

  const fmt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
  };

  const buildBoundaryLabels = (values, min, span) => {
    const unique = [...new Set(values.map(v => Number(v)).filter(Number.isFinite))]
      .sort((a, b) => a - b);

    return unique.map((value, index) => {
      const percent = span === 0 ? 0 : ((value - min) / span) * 100;
      const prev = unique[index - 1];
      const closeToPrev = prev !== undefined && percent - ((prev - min) / span) * 100 < 9;

      return {
        value,
        left: `${percent.toFixed(1)}%`,
        row: closeToPrev ? 1 : 0,
      };
    });
  };

  const renderBoundaryLabels = (labels) => (
    <div className="relative h-8 mt-1">
      {labels.map(label => (
        <span
          key={label.value}
          className={`absolute -translate-x-1/2 whitespace-nowrap font-medium leading-3 text-slate-600 ${labelClass}`}
          style={{ left: label.left, top: label.row ? 15 : 2 }}
        >
          <span className="block mx-auto mb-0.5 h-1.5 w-px bg-slate-400" />
          {fmt(label.value)}
        </span>
      ))}
    </div>
  );

  if (ranges && ranges.length > 0) {
    const valid = ranges.filter(r => r.min !== '' && r.max !== '' && !isNaN(r.min) && !isNaN(r.max));
    if (valid.length === 0) return null;

    const totalMin = Math.min(...valid.map(r => Number(r.min)));
    const totalMax = Math.max(...valid.map(r => Number(r.max)));
    const span = totalMax - totalMin || 1;

    const segments = valid
      .map((r, i) => {
        const start = Math.min(Number(r.min), Number(r.max));
        const end = Math.max(Number(r.min), Number(r.max));
        const leftPct = ((start - totalMin) / span * 100).toFixed(1) + '%';
        const widthPct = ((end - start) / span * 100).toFixed(1) + '%';
        return {
          key: i,
          min: r.min,
          max: r.max,
          label: r.label,
          start,
          left: leftPct,
          width: widthPct,
          color: r.color || '#16a34a',
        };
      })
      .sort((a, b) => a.start - b.start);
    const boundaryLabels = buildBoundaryLabels(
      segments.flatMap(s => [s.min, s.max]),
      totalMin,
      span,
    );

    return (
      <div className="min-w-0">
        <div className="relative rounded overflow-hidden bg-slate-100" style={{ height: h }}>
          {segments.map(s => (
            <div
              key={s.key}
              className="absolute top-0 bottom-0"
              style={{ left: s.left, width: s.width, backgroundColor: s.color }}
            />
          ))}
        </div>
        {showLabels && renderBoundaryLabels(boundaryLabels)}
      </div>
    );
  }

  const vals = [greenMin, greenMax, yellowMin, yellowMax, redMin, redMax]
    .filter(v => v !== '' && v !== undefined && v !== null && !isNaN(v))
    .map(Number);
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pct = v => ((Number(v) - min) / span * 100).toFixed(1) + '%';
  const width = (a, b) => (Math.abs(Number(b) - Number(a)) / span * 100).toFixed(1) + '%';

  const zones = [
    { left: redMin, right: redMax, fill: '#dc262633', labelColor: '#b91c1c' },
    { left: yellowMin, right: yellowMax, fill: '#ca8a0444', labelColor: '#a16207' },
    { left: greenMin, right: greenMax, fill: '#16a34a55', labelColor: '#15803d' },
  ]
    .filter(z => z.left !== '' && z.left !== undefined && z.right !== '' && z.right !== undefined && !isNaN(z.left) && !isNaN(z.right))
    .map((z) => {
      const start = Math.min(Number(z.left), Number(z.right));
      return {
        ...z,
        start,
        end: Math.max(Number(z.left), Number(z.right)),
        leftPct: pct(start),
        widthPct: width(z.left, z.right),
      };
      })
      .sort((a, b) => a.start - b.start);
  const boundaryLabels = buildBoundaryLabels(vals, min, span);

  return (
    <div className="min-w-0">
      <div className="relative rounded overflow-hidden bg-slate-100" style={{ height: h }}>
        {zones.map((z, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 rounded"
            style={{
              left: z.leftPct,
              width: z.widthPct,
              backgroundColor: z.fill,
            }}
          />
        ))}
      </div>
      {showLabels && renderBoundaryLabels(boundaryLabels)}
    </div>
  );
}
