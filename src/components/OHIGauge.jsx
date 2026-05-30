export default function OHIGauge({ value, size = 120, label }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const hasValue = value != null;

  // Arc params
  const r = 40;
  const cx = 60, cy = 60;
  const startAngle = 210; // degrees
  const sweepAngle = 300; // total sweep (210 -> -90 clockwise)

  function polar(angle, radius = r) {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(from, to, invert = false) {
    const s = polar(from);
    const e = polar(to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = invert ? 0 : 1;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
  }

  const endAngle = startAngle + sweepAngle;
  const valueAngle = startAngle + (v / 100) * sweepAngle;

  // Color stops: 0=red, 50=yellow, 100=green
  const hue = Math.round((v / 100) * 120); // 0=red(0deg), 100=green(120deg)
  const color = hasValue ? `hsl(${hue}, 85%, 45%)` : '#94a3b8';

  const scale = size / 120;

  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 120 102" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`g-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      {/* Background track */}
      <path d={arcPath(startAngle, endAngle)} fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
      {/* Value arc */}
      {hasValue && v > 0 && (
        <path d={arcPath(startAngle, valueAngle)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
      )}
      {/* Needle dot */}
      {hasValue && (() => {
        const pt = polar(valueAngle, r);
        return <circle cx={pt.x} cy={pt.y} r="4" fill={color} />;
      })()}
      {/* Center value */}
      <text x="60" y="62" textAnchor="middle" fontSize="20" fontWeight="700" fill={color} fontFamily="system-ui">
        {hasValue ? Math.round(v) : '—'}
      </text>
      <text x="60" y="75" textAnchor="middle" fontSize="7" fill="#94a3b8" fontFamily="system-ui">OHI</text>
      {/* Label below */}
      {label && (
        <text x="60" y="90" textAnchor="middle" fontSize="7.5" fill="#475569" fontFamily="system-ui" fontWeight="500">
          {label.length > 18 ? label.slice(0, 17) + '…' : label}
        </text>
      )}
    </svg>
  );
}