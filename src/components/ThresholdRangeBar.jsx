/**
 * Visual horizontal bar showing color zones.
 * Supports two modes:
 *  1. ranges: array of { min, max, color } — custom segments
 *  2. greenMin/greenMax/yellowMin/yellowMax/redMin/redMax — legacy 3-zone mode
 */
export default function ThresholdRangeBar({ ranges, greenMin, greenMax, yellowMin, yellowMax, redMin, redMax, compact = false }) {
  const h = compact ? 8 : 14;

  // Custom ranges mode
  if (ranges && ranges.length > 0) {
    const valid = ranges.filter(r => r.min !== '' && r.max !== '' && !isNaN(r.min) && !isNaN(r.max));
    if (valid.length === 0) return null;
    const allMins = valid.map(r => Number(r.min));
    const allMaxs = valid.map(r => Number(r.max));
    const total_min = Math.min(...allMins);
    const total_max = Math.max(...allMaxs);
    const span = total_max - total_min || 1;

    return (
      <div className="relative rounded overflow-hidden bg-slate-100" style={{ height: h }}>
        {valid.map((r, i) => {
          const left = ((Number(r.min) - total_min) / span * 100).toFixed(1) + '%';
          const width = ((Number(r.max) - Number(r.min)) / span * 100).toFixed(1) + '%';
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{ left, width, backgroundColor: r.color || '#16a34a' }}
            />
          );
        })}
      </div>
    );
  }

  // Legacy 3-zone mode
  const vals = [greenMin, greenMax, yellowMin, yellowMax, redMin, redMax]
    .filter(v => v !== '' && v !== undefined && v !== null && !isNaN(v))
    .map(Number);
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pct = v => ((Number(v) - min) / span * 100).toFixed(1) + '%';
  const w = (a, b) => (Math.abs(Number(b) - Number(a)) / span * 100).toFixed(1) + '%';

  const zones = [
    { left: redMin, right: redMax, color: '#dc262633' },
    { left: yellowMin, right: yellowMax, color: '#ca8a0444' },
    { left: greenMin, right: greenMax, color: '#16a34a55' },
  ].filter(z => z.left !== '' && z.left !== undefined && z.right !== '' && z.right !== undefined && !isNaN(z.left) && !isNaN(z.right));

  return (
    <div className="relative rounded overflow-hidden bg-slate-100" style={{ height: h }}>
      {zones.map((z, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 rounded"
          style={{
            left: pct(Math.min(z.left, z.right)),
            width: w(z.left, z.right),
            backgroundColor: z.color,
          }}
        />
      ))}
    </div>
  );
}