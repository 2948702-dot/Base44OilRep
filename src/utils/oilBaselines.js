function toTime(date) {
  const time = date ? new Date(date).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function oilIdForSample(sample, units = []) {
  if (!sample) return null;
  const unit = units.find(u => u.id === sample.equipment_unit_id);
  return sample.oil_type_id || unit?.current_oil_type_id || unit?.oil_type_id || null;
}

export function findFreshOilBaseline(sample, samples = [], results = [], units = []) {
  if (!sample || sample.sample_type === 'fresh_oil') return null;

  const sampleOilId = oilIdForSample(sample, units);
  const sampleTime = toTime(sample.sampling_date);

  const candidates = samples
    .filter(candidate => {
      if (candidate.sample_type !== 'fresh_oil') return false;
      if (candidate.id === sample.id) return false;
      if (sample.lifecycle_id && candidate.lifecycle_id === sample.lifecycle_id) return true;
      if (!sample.equipment_unit_id || candidate.equipment_unit_id !== sample.equipment_unit_id) return false;
      if (sampleOilId && oilIdForSample(candidate, units) !== sampleOilId) return false;
      if (sampleTime && toTime(candidate.sampling_date) > sampleTime) return false;
      return true;
    })
    .map(candidate => ({
      sample: candidate,
      result: results.find(result => result.sample_id === candidate.id),
      time: toTime(candidate.sampling_date),
      lifecycleMatch: sample.lifecycle_id && candidate.lifecycle_id === sample.lifecycle_id,
    }))
    .filter(candidate => candidate.result)
    .sort((a, b) => {
      if (a.lifecycleMatch !== b.lifecycleMatch) return a.lifecycleMatch ? -1 : 1;
      return b.time - a.time;
    });

  return candidates[0] || null;
}

export function getReferenceValue(key, oilRef, baselineResult) {
  const baselineMap = {
    water_ppm: 'water_ppm',
    water_activity: 'water_activity',
    viscosity_40: 'viscosity_40',
    density: 'density',
    dielectric_constant: 'dielectric_constant',
  };
  const passportMap = {
    viscosity_40: 'passport_viscosity_40',
    density: 'passport_density_15',
    dielectric_constant: 'passport_dielectric',
  };

  const baselineKey = baselineMap[key];
  if (baselineKey && baselineResult?.[baselineKey] !== null && baselineResult?.[baselineKey] !== undefined) {
    return { value: Number(baselineResult[baselineKey]), source: 'fresh_oil' };
  }

  const passportKey = passportMap[key];
  if (passportKey && oilRef?.[passportKey] !== null && oilRef?.[passportKey] !== undefined) {
    return { value: Number(oilRef[passportKey]), source: 'passport' };
  }

  return { value: null, source: null };
}
