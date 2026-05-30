/**
 * Visual horizontal bar showing green / yellow / red zones.
 * All values must be numeric. Zones not provided are shown as gaps.
 */
export default function ThresholdRangeBar({ greenMin, greenMax, yellowMin, yellowMax, redMin, redMax, compact = false }) {
  const vals = [greenMin, greenMax, yellowMin, yellowMax, redMin, redMax].filter(v => v !== '' && v !== undefined && v !== null && !isNaN(v)).map(Number);
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const pct = v => ((Number(v) - min) / span * 100).toFixed(1) + '%';
  const w = (a, b) => (Math.abs(Number(b) - Number(a)) / span * 100).toFixed(1) + '%';

  const zones = [
    { left: greenMin, right: greenMax, color: '#16a34a22', border: '#16a34a' },
    { left: yellowMin, right: yellowMax, color: '#ca8a0422', border: '#ca8a04' },
    { left: redMin, right: redMax, color: '#dc262622', border: '#dc2626' },
  ].filter(z => z.left !== '' && z.left !== undefined && z.right !== '' && z.right !== undefined && !isNaN(z.left) && !isNaN(z.right));

  const h = compact ? 8 : 14;

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
            borderTop: `2px solid ${z.border}`,
          }}
        />
      ))}
    </div>
  );
}