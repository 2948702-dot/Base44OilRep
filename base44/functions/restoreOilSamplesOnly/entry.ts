import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Получаем существующие данные для привязки
    const clients = await base44.asServiceRole.entities.Client.list();
    const assets = await base44.asServiceRole.entities.Asset.list();
    const units = await base44.asServiceRole.entities.EquipmentUnit.list();
    const points = await base44.asServiceRole.entities.SamplingPoint.list();
    const oils = await base44.asServiceRole.entities.OilReference.list();

    if (!clients.length || !assets.length || !units.length || !points.length) {
      return Response.json({
        success: false,
        message: 'Нужны существующие клиенты, активы, оборудование и точки отбора для восстановления проб'
      }, { status: 400 });
    }

    // Создаём пробы масла с анализами
    const samples = [
      {
        sample_type: 'in_service',
        sample_number: 'SO-2025-001',
        can_qr_code: 'QR-001',
        client_id: clients[0].id,
        asset_id: assets[0]?.id || '',
        equipment_unit_id: units[0]?.id || '',
        sampling_point_id: points[0]?.id || '',
        oil_type_id: oils[0]?.id || '',
        sampling_date: '2026-05-31',
        total_hours_at_sampling: 5200,
        oil_hours_at_sampling: 1850,
        engine_state: 'warm',
        sample_status: 'completed',
        comments: 'Восстановленная проба'
      },
      {
        sample_type: 'in_service',
        sample_number: 'SO-2025-002',
        can_qr_code: 'QR-002',
        client_id: clients[0].id,
        asset_id: assets[0]?.id || '',
        equipment_unit_id: units[1]?.id || units[0]?.id || '',
        sampling_point_id: points[0]?.id || '',
        oil_type_id: oils[0]?.id || '',
        sampling_date: '2026-05-31',
        total_hours_at_sampling: 3800,
        oil_hours_at_sampling: 950,
        engine_state: 'cold',
        sample_status: 'completed',
        comments: 'Восстановленная проба'
      },
      {
        sample_type: 'fresh_oil',
        sample_number: 'SO-2025-003',
        can_qr_code: 'QR-003',
        client_id: clients[0].id,
        sampling_date: '2026-05-31',
        sample_status: 'completed',
        batch_number: 'BATCH-2026-001',
        production_date: '2026-01-15',
        supplier: 'OilCorp',
        comments: 'Восстановленная проба свежего масла'
      }
    ];

    const createdSamples = await base44.asServiceRole.entities.OilSample.bulkCreate(samples);

    // Создаём анализы для проб
    const analysisResults = [
      {
        sample_id: createdSamples[0].id,
        client_id: clients[0].id,
        asset_id: assets[0]?.id || '',
        iron_mg_l: 42.5,
        water_ppm: 380,
        water_activity: 0.65,
        viscosity_40: 38.2,
        density: 860,
        dielectric_constant: 2.4,
        wear_index: 35,
        oil_health_index: 72,
        overall_status: 'green',
        recommendation_text: 'Масло в хорошем состоянии. Продолжать мониторинг'
      },
      {
        sample_id: createdSamples[1].id,
        client_id: clients[0].id,
        asset_id: assets[0]?.id || '',
        iron_mg_l: 58.3,
        water_ppm: 520,
        water_activity: 0.78,
        viscosity_40: 35.8,
        density: 865,
        dielectric_constant: 2.2,
        wear_index: 55,
        oil_health_index: 48,
        overall_status: 'yellow',
        recommendation_text: 'Требуется внимание к уровню воды и железа'
      }
    ];

    await base44.asServiceRole.entities.AnalysisResult.bulkCreate(analysisResults);

    return Response.json({
      success: true,
      message: `Восстановлено ${createdSamples.length} проб масла с анализами`,
      samples: createdSamples
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});