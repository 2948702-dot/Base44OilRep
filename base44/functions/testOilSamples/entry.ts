import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get test data
    const clients = await base44.entities.Client.list();
    const assets = await base44.entities.Asset.list();
    const units = await base44.entities.EquipmentUnit.list();
    const points = await base44.entities.SamplingPoint.list();

    if (!clients.length || !assets.length || !units.length || !points.length) {
      return Response.json({ error: 'Missing required data' }, { status: 400 });
    }

    const client = clients[0];
    const asset = assets.find(a => a.client_id === client.id);
    const unit = units.find(u => u.asset_id === asset.id);
    const point = points.find(p => p.equipment_unit_id === unit.id);

    // Create fresh oil sample
    const freshSample = await base44.entities.OilSample.create({
      sample_type: 'fresh_oil',
      sample_number: 'TEST-FRESH-001',
      client_id: client.id,
      sampling_date: '2026-05-30',
      batch_number: 'BATCH-2026-001',
      production_date: '2026-01-15',
      storage_type: 'Закрытый склад',
      delivery_date: '2026-01-20',
      supplier: 'Shell',
      sample_status: 'pending',
      comments: 'Test fresh oil sample'
    });

    // Create in-service sample
    const serviceSample = await base44.entities.OilSample.create({
      sample_type: 'in_service',
      sample_number: 'TEST-SERVICE-001',
      client_id: client.id,
      asset_id: asset.id,
      equipment_unit_id: unit.id,
      sampling_point_id: point.id,
      sampling_date: '2026-05-30',
      engine_state: 'warm',
      total_hours_at_sampling: 15000,
      oil_hours_at_sampling: 2500,
      sample_status: 'pending',
      comments: 'Test in-service oil sample'
    });

    return Response.json({
      success: true,
      freshSample: freshSample.id,
      serviceSample: serviceSample.id,
      message: 'Test samples created successfully'
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});