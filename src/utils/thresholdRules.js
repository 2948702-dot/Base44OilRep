const RED = '#ef4444';
const YELLOW = '#eab308';
const GREEN = '#22c55e';

const LIMIT_FIELDS = ['green_min', 'green_max', 'yellow_min', 'yellow_max', 'red_min', 'red_max'];

function hasValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function hasAnyLimit(rule) {
  if (!rule) return false;
  if (rule.custom_ranges_mode && Array.isArray(rule.ranges) && rule.ranges.some(r => hasValue(r.min) && hasValue(r.max))) {
    return true;
  }
  return LIMIT_FIELDS.some(field => hasValue(rule[field]));
}

function matchesOil(rule, oilTypeId) {
  return oilTypeId && rule.oil_type_id === oilTypeId;
}

function isGlobalRule(rule) {
  return !rule.equipment_unit_id && (!rule.equipment_type || rule.equipment_type === 'all');
}

export function resolveThresholdRule(rules, paramKey, oilTypeId, unit) {
  const unitRule = unit?.use_standard_thresholds === false && Array.isArray(unit.custom_thresholds)
    ? unit.custom_thresholds.find(rule => rule.parameter_name === paramKey && hasAnyLimit(rule))
    : null;

  if (unitRule) {
    return { ...unitRule, parameter_name: paramKey, source: 'unit' };
  }

  const candidates = (rules || []).filter(rule => rule.parameter_name === paramKey && hasAnyLimit(rule));

  return (
    candidates.find(rule => matchesOil(rule, oilTypeId) && isGlobalRule(rule)) ||
    null
  );
}

function inRange(value, min, max) {
  if (!hasValue(value) || !hasValue(min) || !hasValue(max)) return false;
  const v = Number(value);
  const a = Number(min);
  const b = Number(max);
  return v >= Math.min(a, b) && v <= Math.max(a, b);
}

function customRangeSeverity(range) {
  const color = String(range.color || '').toLowerCase();
  const label = String(range.label || '').toLowerCase();
  if (color.includes('dc2626') || color.includes('ef4444') || label.includes('red') || label.includes('крас')) return 'red';
  if (color.includes('ca8a04') || color.includes('eab308') || color.includes('f97316') || label.includes('yellow') || label.includes('orange') || label.includes('жел')) return 'yellow';
  if (color.includes('16a34a') || color.includes('22c55e') || label.includes('green') || label.includes('норм') || label.includes('зел')) return 'green';
  return null;
}

export function getThresholdSeverity(rule, value) {
  if (!rule || !hasValue(value)) return null;

  if (rule.custom_ranges_mode && Array.isArray(rule.ranges)) {
    const matching = rule.ranges.find(range => inRange(value, range.min, range.max));
    return matching ? customRangeSeverity(matching) : null;
  }

  if (inRange(value, rule.green_min, rule.green_max)) return 'green';
  if (inRange(value, rule.yellow_min, rule.yellow_max)) return 'yellow';
  if (inRange(value, rule.red_min, rule.red_max)) return 'red';
  return null;
}

export function buildThresholdGaugeZones(rule) {
  if (!rule) return null;

  if (rule.custom_ranges_mode && Array.isArray(rule.ranges) && rule.ranges.length > 0) {
    const valid = rule.ranges.filter(r => hasValue(r.min) && hasValue(r.max));
    if (!valid.length) return null;
    const totalMin = Math.min(...valid.map(r => Number(r.min)));
    const totalMax = Math.max(...valid.map(r => Number(r.max)));
    const span = totalMax - totalMin;
    if (span <= 0) return null;

    return {
      min: totalMin,
      max: totalMax,
      zones: valid
        .map(r => ({
          from: (Number(r.min) - totalMin) / span,
          to: (Number(r.max) - totalMin) / span,
          color: r.color || '#94a3b8',
        }))
        .sort((a, b) => a.from - b.from),
    };
  }

  const vals = LIMIT_FIELDS.map(field => rule[field]).filter(hasValue).map(Number);
  if (!vals.length) return null;
  const totalMin = Math.min(...vals);
  const totalMax = Math.max(...vals);
  const span = totalMax - totalMin;
  if (span <= 0) return null;

  const norm = value => (Number(value) - totalMin) / span;
  const zones = [];
  if (hasValue(rule.green_min) && hasValue(rule.green_max)) zones.push({ from: norm(rule.green_min), to: norm(rule.green_max), color: GREEN });
  if (hasValue(rule.yellow_min) && hasValue(rule.yellow_max)) zones.push({ from: norm(rule.yellow_min), to: norm(rule.yellow_max), color: YELLOW });
  if (hasValue(rule.red_min) && hasValue(rule.red_max)) zones.push({ from: norm(rule.red_min), to: norm(rule.red_max), color: RED });

  return zones.length
    ? { min: totalMin, max: totalMax, zones: zones.sort((a, b) => a.from - b.from) }
    : null;
}
