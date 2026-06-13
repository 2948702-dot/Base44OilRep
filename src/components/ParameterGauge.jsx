import { useMemo } from 'react';

// cx=50, cy=52, r=40, arc 180°→0° (left to right, top semi-circle)
const CX = 50, CY = 52, R = 40, R_INNER = 28;

function clampPct(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function polarToXY(angleDeg, r = R) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcSegment(startPct, endPct, outerR, innerR) {
  const from = Math.min(clampPct(startPct), clampPct(endPct));
  const to = Math.max(clampPct(startPct), clampPct(endPct));
  const startAngle = 180 - from * 180;
  const endAngle = 180 - to * 180;
  const o1 = polarToXY(startAngle, outerR);
  const o2 = polarToXY(endAngle, outerR);
  const i1 = polarToXY(endAngle, innerR);
  const i2 = polarToXY(startAngle, innerR);
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 0 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 0 0 ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// zones: [{from: 0-1, to: 0-1, color: '#...'}]
// value: actual value
// min, max: gauge range
// label, unit
export default function ParameterGauge({ label, value, unit, min = 0, max = 100, zones = [], decimals = 1 }) {
  const safeZones = useMemo(() => zones
    .map(zone => ({
      ...zone,
      from: Math.min(clampPct(zone.from), clampPct(zone.to)),
      to: Math.max(clampPct(zone.from), clampPct(zone.to)),
    }))
    .filter(zone => Number.isFinite(zone.from) && Number.isFinite(zone.to) && zone.to > zone.from)
    .sort((a, b) => (b.to - b.from) - (a.to - a.from)), [zones]);

  const zoneBoundaries = useMemo(() => [...new Set(
    safeZones
      .flatMap(zone => [zone.from, zone.to])
      .filter(boundary => boundary > 0 && boundary < 1)
      .map(boundary => boundary.toFixed(6)),
  )].map(Number).sort((a, b) => a - b), [safeZones]);

  const pct = useMemo(() => {
    if (value == null || !Number.isFinite(Number(value)) || max <= min) return null;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }, [value, min, max]);

  const needleAngle = pct != null ? 180 - pct * 180 : 90;
  const needleTip = polarToXY(needleAngle, R - 4);
  const needleLeft = polarToXY(needleAngle + 90, 3);
  const needleRight = polarToXY(needleAngle - 90, 3);

  // Determine zone color for value display
  const valueColor = useMemo(() => {
    if (pct == null) return '#94a3b8';
    const zone = [...safeZones].reverse().find(z => pct >= z.from && pct <= z.to);
    return zone ? zone.color : '#94a3b8';
  }, [pct, safeZones]);

  const displayValue = value != null
    ? (decimals === 0 ? Math.round(value) : +value.toFixed(decimals))
    : '—';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" className="w-full max-w-[160px]">
        {/* Background arc */}
        <path d={arcSegment(0, 1, R, R_INNER)} fill="#e2e8f0" />
        {/* Colored zone segments */}
        {safeZones.map((z, i) => (
          <path key={i} d={arcSegment(z.from, z.to, R, R_INNER)} fill={z.color} opacity={0.85} />
        ))}
        {/* Zone border ticks */}
        {zoneBoundaries.map((boundary, i) => {
          const pt = polarToXY(180 - boundary * 180, R + 1);
          const pt2 = polarToXY(180 - boundary * 180, R_INNER - 1);
          return <line key={i} x1={pt.x} y1={pt.y} x2={pt2.x} y2={pt2.y} stroke="white" strokeWidth="1.5" />;
        })}

        {/* Needle */}
        {pct != null && (
          <>
            <polygon
              points={`${needleTip.x.toFixed(2)},${needleTip.y.toFixed(2)} ${needleLeft.x.toFixed(2)},${needleLeft.y.toFixed(2)} ${needleRight.x.toFixed(2)},${needleRight.y.toFixed(2)}`}
              fill="#1e293b"
            />
            <circle cx={CX} cy={CY} r={3.5} fill="#1e293b" />
            <circle cx={CX} cy={CY} r={2} fill="white" />
          </>
        )}

        {/* Min/Max labels */}
        <text x="9" y="57" fontSize="6" fill="#94a3b8" textAnchor="middle">{min}</text>
        <text x="91" y="57" fontSize="6" fill="#94a3b8" textAnchor="middle">{max}</text>
      </svg>

      {/* Value + unit */}
      <div className="text-center -mt-1">
        <span className="text-lg font-bold" style={{ color: valueColor }}>{displayValue}</span>
        {unit && value != null && <span className="text-xs text-slate-400 ml-1">{unit}</span>}
      </div>
      <p className="text-xs text-slate-500 mt-0.5 text-center leading-tight">{label}</p>
    </div>
  );
}
