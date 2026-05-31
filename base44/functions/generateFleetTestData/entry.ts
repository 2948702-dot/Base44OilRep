import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Получить все суда, узлы, точки отбора
    const assets = await base44.asServiceRole.entities.Asset.list();
    const equipmentUnits = await base44.asServiceRole.entities.EquipmentUnit.list();
    const samplingPoints = await base44.asServiceRole.entities.SamplingPoint.list();
    const oilReferences = await base44.asServiceRole.entities.OilReference.list();

    let stats = {
      oilSamples: 0,
      analysisResults: 0,
      maintenanceEvents: 0,
      oilLifecycles: 0,
      errors: []
    };

    if (!oilReferences.length) {
      return Response.json({ error: 'No oil references found. Create some oil types first.' }, { status: 400 });
    }

    // Для каждого судна
    for (const asset of assets) {
      try {
        const assetEquipment = equipmentUnits.filter(e => e.asset_id === asset.id);
        const assetSamplingPoints = samplingPoints.filter(sp => sp.asset_id === asset.id);

        if (!assetEquipment.length || !assetSamplingPoints.length) continue;

        // Для каждой точки отбора создать пробы за последний год
        for (const point of assetSamplingPoints) {
          const oil = oilReferences[Math.floor(Math.random() * oilReferences.length)];
          
          // Создать 12-14 проб за год (раз в месяц + немного разброса)
          const now = new Date();
          const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          let currentDate = new Date(oneYearAgo);
          let totalHours = Math.floor(Math.random() * 50000) + 10000;
          let oilHours = Math.floor(Math.random() * 3000) + 500;
          let ironLevel = Math.floor(Math.random() * 30) + 10;
          let waterLevel = Math.floor(Math.random() * 300) + 50;

          while (currentDate < now) {
            // Создать пробу
            const sample = await base44.asServiceRole.entities.OilSample.create({
              sample_type: 'in_service',
              sample_number: `${asset.asset_name}-${point.point_name}-${currentDate.toISOString().split('T')[0]}`,
              client_id: asset.client_id,
              asset_id: asset.id,
              equipment_unit_id: assetEquipment[0].id,
              sampling_point_id: point.id,
              oil_type_id: oil.id,
              sampling_date: currentDate.toISOString().split('T')[0],
              total_hours_at_sampling: totalHours,
              oil_hours_at_sampling: oilHours,
              engine_state: 'warm',
              sample_status: 'completed'
            });
            stats.oilSamples++;

            // Создать результат анализа с реалистичной динамикой
            ironLevel += Math.floor(Math.random() * 10) + 1; // железо растёт
            waterLevel += Math.floor(Math.random() * 100) - 30; // вода колеблется
            waterLevel = Math.max(50, waterLevel);

            const viscosity40 = (oil.passport_viscosity_40 || 46) + (Math.random() * 4 - 2);
            const oilHealthIndex = Math.max(20, 100 - (ironLevel - 10) * 2 - (waterLevel - 50) * 0.1);

            await base44.asServiceRole.entities.AnalysisResult.create({
              sample_id: sample.id,
              iron_mg_l: ironLevel,
              water_ppm: waterLevel,
              water_activity: waterLevel / 1000,
              viscosity_40: viscosity40,
              density: (oil.passport_density_15 || 880) + (Math.random() * 5 - 2.5),
              dielectric_constant: (oil.passport_dielectric || 2.5) + (Math.random() * 0.3 - 0.15),
              water_index: Math.max(0, 100 - waterLevel),
              wear_index: Math.max(0, 100 - ironLevel * 2),
              viscosity_index_calc: 95 + Math.random() * 10,
              dielectric_index: 75 + Math.random() * 20,
              oil_health_index: oilHealthIndex,
              overall_status: oilHealthIndex > 70 ? 'green' : oilHealthIndex > 40 ? 'yellow' : 'red',
              recommendation_text: oilHealthIndex < 50 ? 'Требуется смена масла' : 'Масло в норме'
            });
            stats.analysisResults++;

            // Случайно создать события смены масла (раз в 3-4 месяца)
            if (Math.random() < 0.25) {
              await base44.asServiceRole.entities.MaintenanceEvent.create({
                event_type: 'oil_change',
                event_date: currentDate.toISOString().split('T')[0],
                client_id: asset.client_id,
                asset_id: asset.id,
                equipment_unit_id: assetEquipment[0].id,
                sampling_point_id: point.id,
                total_operating_hours: totalHours,
                old_oil_type_id: oil.id,
                new_oil_type_id: oil.id,
                replaced_oil_volume: point.oil_volume || 100,
                added_oil_volume: 0,
                comment: 'Плановая смена масла'
              });
              stats.maintenanceEvents++;
              
              // Сбросить счётчики после смены
              ironLevel = Math.floor(Math.random() * 15) + 5;
              waterLevel = Math.floor(Math.random() * 200) + 30;
              oilHours = 0;
            }

            // Перейти к следующей дате (27-35 дней)
            currentDate.setDate(currentDate.getDate() + 27 + Math.floor(Math.random() * 8));
            totalHours += Math.floor(Math.random() * 300) + 100;
            oilHours += Math.floor(Math.random() * 300) + 100;
          }

          // Создать или обновить Oil Lifecycle
          const existingLifecycle = await base44.asServiceRole.entities.OilLifecycle.filter({
            sampling_point_id: point.id,
            status: 'active'
          });
          
          if (!existingLifecycle.length) {
            await base44.asServiceRole.entities.OilLifecycle.create({
              sampling_point_id: point.id,
              oil_type_id: oil.id,
              start_date: oneYearAgo.toISOString().split('T')[0],
              start_operating_hours: Math.floor(Math.random() * 50000) + 10000,
              status: 'active',
              start_reason: 'Начало мониторинга'
            });
            stats.oilLifecycles++;
          }
        }
      } catch (err) {
        stats.errors.push(`${asset.asset_name}: ${err.message}`);
      }
    }

    return Response.json({
      success: true,
      message: 'Fleet test data generated successfully',
      stats
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});