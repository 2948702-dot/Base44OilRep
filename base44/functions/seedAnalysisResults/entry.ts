import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const db = base44.asServiceRole;

    // Fetch all completed samples and oil references
    const [allSamples, oils] = await Promise.all([
      db.entities.OilSample.filter({ sample_status: 'completed' }),
      db.entities.OilReference.list(),
    ]);

    // Select the LATEST sample per sampling point so every point gets a result
    const latestByPoint = {};
    for (const s of allSamples) {
      const key = s.sampling_point_id || s.id;
      if (!latestByPoint[key] || new Date(s.sampling_date) > new Date(latestByPoint[key].sampling_date)) {
        latestByPoint[key] = s;
      }
    }
    const samples = Object.values(latestByPoint).slice(0, 120);

    if (!samples.length) return Response.json({ error: 'No completed samples found' }, { status: 400 });

    // Clear existing results (batch delete if any)
    const existing = await db.entities.AnalysisResult.list(undefined, 100);
    for (let i = 0; i < existing.length; i++) {
      await db.entities.AnalysisResult.delete(existing[i].id);
      if (i % 10 === 9) await new Promise(r => setTimeout(r, 500));
    }

    const oilMap = Object.fromEntries(oils.map(o => [o.id, o]));

    // Typical intervals by equipment pattern (hours)
    const TYPICAL_H = 1000;

    const results = [];
    let batchDelay = 0;

    for (const sample of samples) {
      const oil = oilMap[sample.oil_type_id] || {};
      const oilHours = sample.oil_hours_at_sampling || 500;
      // rnd helper
      const rnd = (min, max) => min + Math.random() * (max - min);
      // Degradation factor with positive bias so fleet looks mostly healthy
      const rawDeg = Math.min(1, oilHours / (TYPICAL_H * 1.5));
      const deg = Math.max(0, rawDeg * rnd(0.3, 0.8));

      // Iron: 10 fresh → 80 at end of life
      const iron_mg_l = Math.round(rnd(8, 20) + deg * rnd(40, 70));

      // Water
      const water_ppm = Math.round(rnd(50, 150) + deg * rnd(200, 600));
      const water_activity = +(rnd(0.05, 0.15) + deg * rnd(0.2, 0.5)).toFixed(3);

      // Viscosity relative to passport (±15%)
      const baseVis40 = oil.passport_viscosity_40 || 95;
      const baseVis100 = oil.passport_viscosity_100 || 11;
      const visShift = deg * rnd(-0.1, 0.15); // slight increase with degradation
      const viscosity_40 = +(baseVis40 * (1 + visShift + rnd(-0.03, 0.03))).toFixed(1);
      const viscosity_100 = +(baseVis100 * (1 + visShift * 0.5 + rnd(-0.02, 0.02))).toFixed(1);

      // Density
      const baseDens = oil.passport_density_15 || 880;
      const density = +(baseDens + rnd(-3, 3)).toFixed(1);

      // Dielectric: 2.2 fresh → 4.5 at end
      const dielectric_constant = +(rnd(2.1, 2.5) + deg * rnd(1.0, 2.2)).toFixed(2);

      // === Calculate indices (mirrors AnalysisResults.jsx calcIndexes logic) ===
      // Water index (0=good, 100=bad)
      const water_index = Math.min(100, Math.round(
        Math.max(0, (water_activity - 0.1) / 0.5 * 50) +
        Math.max(0, (water_ppm - 200) / 800 * 50)
      ));

      // Wear index based on iron
      const wear_index = Math.min(100, Math.round(iron_mg_l / 80 * 100));

      // Viscosity index: deviation from passport
      const visDeviation = Math.abs((viscosity_40 - baseVis40) / baseVis40);
      const viscosity_index_calc = Math.min(100, Math.round(visDeviation / 0.2 * 100));

      // Dielectric index
      const dielectric_index = Math.min(100, Math.round(Math.max(0, (dielectric_constant - 2.5) / 2.0 * 100)));

      // OHI = weighted average of inverted indices
      const ohi = Math.round(
        100 - (water_index * 0.25 + wear_index * 0.35 + viscosity_index_calc * 0.2 + dielectric_index * 0.2)
      );
      const oil_health_index = Math.max(0, Math.min(100, ohi));

      const overall_status = oil_health_index >= 70 ? 'green' : oil_health_index >= 45 ? 'yellow' : 'red';

      let recommendation_text = '';
      if (overall_status === 'green') recommendation_text = 'Масло в норме. Продолжать плановый мониторинг.';
      else if (overall_status === 'yellow') recommendation_text = 'Требуется повышенный контроль. Рекомендуется внеплановый отбор пробы через 250 м/ч.';
      else recommendation_text = 'Критическое состояние масла. Требуется немедленная замена масла.';

      const record = {
        sample_id: sample.id,
        iron_mg_l,
        water_ppm,
        water_activity,
        viscosity_40,
        viscosity_100,
        density,
        dielectric_constant,
        water_index,
        wear_index,
        viscosity_index_calc,
        dielectric_index,
        oil_health_index,
        overall_status,
        recommendation_text,
      };

      results.push(record);
    }

    // Batch insert one by one with delays
    const created = [];
    for (let i = 0; i < results.length; i++) {
      const saved = await db.entities.AnalysisResult.create(results[i]);
      created.push(saved);
      if (i % 3 === 2) await new Promise(r => setTimeout(r, 1200));
    }

    const statusBreakdown = {
      green: results.filter(r => r.overall_status === 'green').length,
      yellow: results.filter(r => r.overall_status === 'yellow').length,
      red: results.filter(r => r.overall_status === 'red').length,
    };

    return Response.json({
      success: true,
      message: `Создано ${created.length} результатов анализов для ${samples.length} проб`,
      breakdown: statusBreakdown,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});