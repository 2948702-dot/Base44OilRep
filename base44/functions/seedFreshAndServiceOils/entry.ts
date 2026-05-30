import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const created = [];

    // Fresh oil samples
    for (let i = 1; i <= 5; i++) {
      const sample = await base44.entities.OilSample.create({
        sample_type: 'fresh_oil',
        sample_number: `FRESH-${i}`,
        client_id: client.id,
        sampling_date: `2026-05-${String(i + 20).padStart(2, '0')}`,
        batch_number: `BATCH-2026-00${i}`,
        production_date: `2026-01-${String(i * 2).padStart(2, '0')}`,
        storage_type: ['Закрытый склад', 'На открытом воздухе', 'Холодное хранилище', 'Другое'][i % 4],
        delivery_date: `2026-02-${String(i).padStart(2, '0')}`,
        supplier: ['Shell', 'Mobil', 'Castrol', 'Total'][i % 4],
        sample_status: 'pending',
        comments: `Fresh oil test ${i}`
      });
      created.push({ type: 'fresh_oil', id: sample.id, number: sample.sample_number });
    }

    // In-service samples
    for (let i = 1; i <= 5; i++) {
      const sample = await base44.entities.OilSample.create({
        sample_type: 'in_service',
        sample_number: `SERVICE-${i}`,
        client_id: client.id,
        asset_id: asset.id,
        equipment_unit_id: unit.id,
        sampling_point_id: point.id,
        sampling_date: `2026-05-${String(i + 20).padStart(2, '0')}`,
        engine_state: i % 2 === 0 ? 'warm' : 'cold',
        total_hours_at_sampling: 10000 + i * 1000,
        oil_hours_at_sampling: 2000 + i * 500,
        sample_status: ['pending', 'in_analysis', 'completed'][i % 3],
        comments: `In-service test ${i}`
      });
      created.push({ type: 'in_service', id: sample.id, number: sample.sample_number });
    }

    return Response.json({
      success: true,
      created,
      count: created.length
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});