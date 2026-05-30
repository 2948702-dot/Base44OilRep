import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = {};

    // 1. Create oil reference with ISO VG and SAE
    const oil = await base44.entities.OilReference.create({
      oil_name: 'Shell Tellus S4 VE 46',
      manufacturer: 'Shell',
      oil_category: 'Гидравлическое',
      iso_vg_grade: 'ISO VG 46',
      sae_grade: 'SAE 10W',
      passport_viscosity_40: 46,
      passport_viscosity_100: 6.9,
      passport_viscosity_index: 95,
      passport_density_15: 870,
      passport_flash_point: 220,
      passport_pour_point: -12,
      passport_dielectric: 6.2,
      passport_tbn: 7.5,
      passport_tan: 0.4,
      passport_ash_content: 1.0,
      comments: 'Test oil with ISO VG and SAE'
    });
    results.oil_created = { id: oil.id, name: oil.oil_name, iso_vg: oil.iso_vg_grade, sae: oil.sae_grade };

    // 2. Get test data
    const clients = await base44.entities.Client.list();
    const assets = await base44.entities.Asset.list();
    const units = await base44.entities.EquipmentUnit.list();
    const points = await base44.entities.SamplingPoint.list();

    const client = clients[0];
    const asset = assets.find(a => a.client_id === client.id);
    const unit = units.find(u => u.asset_id === asset.id);
    const point = points.find(p => p.equipment_unit_id === unit.id);

    // 3. Create fresh oil sample
    const freshSample = await base44.entities.OilSample.create({
      sample_type: 'fresh_oil',
      sample_number: 'FINAL-FRESH-001',
      client_id: client.id,
      sampling_date: '2026-05-30',
      batch_number: 'BATCH-FINAL-001',
      production_date: '2026-05-01',
      storage_type: 'Холодное хранилище',
      delivery_date: '2026-05-10',
      supplier: 'Shell',
      sample_status: 'pending'
    });
    results.fresh_sample = {
      id: freshSample.id,
      number: freshSample.sample_number,
      type: freshSample.sample_type,
      batch: freshSample.batch_number,
      production_date: freshSample.production_date,
      storage: freshSample.storage_type,
      delivery: freshSample.delivery_date,
      supplier: freshSample.supplier
    };

    // 4. Create in-service sample
    const serviceSample = await base44.entities.OilSample.create({
      sample_type: 'in_service',
      sample_number: 'FINAL-SERVICE-001',
      client_id: client.id,
      asset_id: asset.id,
      equipment_unit_id: unit.id,
      sampling_point_id: point.id,
      sampling_date: '2026-05-30',
      engine_state: 'warm',
      total_hours_at_sampling: 25000,
      oil_hours_at_sampling: 5000,
      sample_status: 'in_analysis'
    });
    results.service_sample = {
      id: serviceSample.id,
      number: serviceSample.sample_number,
      type: serviceSample.sample_type,
      engine_state: serviceSample.engine_state,
      total_hours: serviceSample.total_hours_at_sampling,
      oil_hours: serviceSample.oil_hours_at_sampling
    };

    // 5. Update fresh sample (edit test)
    const updatedFresh = await base44.entities.OilSample.update(freshSample.id, {
      batch_number: 'BATCH-UPDATED-001',
      storage_type: 'Закрытый склад'
    });
    results.fresh_sample_updated = {
      batch: updatedFresh.batch_number,
      storage: updatedFresh.storage_type
    };

    // 6. Update service sample (edit test)
    const updatedService = await base44.entities.OilSample.update(serviceSample.id, {
      oil_hours_at_sampling: 5500,
      sample_status: 'completed'
    });
    results.service_sample_updated = {
      oil_hours: updatedService.oil_hours_at_sampling,
      status: updatedService.sample_status
    };

    return Response.json({
      success: true,
      results
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});