import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Predefined scenario: 10 main engines, realistic 18-month history
const SCENARIOS = [
  // [monthOffset, eventType, volumeOrNull]
  // Main engine: change every 1000h (~5 months), topup every 250h
  { type: 'main_engine', events: [
    { m: 0,  t: 'oil_change', vol: 88,  addedVol: null },
    { m: 1,  t: 'oil_topup',  vol: null, addedVol: 7 },
    { m: 2,  t: 'oil_topup',  vol: null, addedVol: 9 },
    { m: 3,  t: 'oil_topup',  vol: null, addedVol: 6 },
    { m: 4,  t: 'oil_topup',  vol: null, addedVol: 8 },
    { m: 5,  t: 'oil_change', vol: 92,  addedVol: null },
    { m: 6,  t: 'oil_topup',  vol: null, addedVol: 7 },
    { m: 7,  t: 'oil_topup',  vol: null, addedVol: 5 },
    { m: 9,  t: 'oil_topup',  vol: null, addedVol: 10 },
    { m: 10, t: 'oil_change', vol: 85,  addedVol: null },
    { m: 11, t: 'oil_topup',  vol: null, addedVol: 6 },
    { m: 13, t: 'oil_topup',  vol: null, addedVol: 8 },
    { m: 15, t: 'oil_change', vol: 90,  addedVol: null },
    { m: 16, t: 'oil_topup',  vol: null, addedVol: 7 },
  ]},
  { type: 'aux_engine', events: [
    { m: 0,  t: 'oil_change', vol: 48,  addedVol: null },
    { m: 2,  t: 'oil_topup',  vol: null, addedVol: 4 },
    { m: 3,  t: 'oil_change', vol: 52,  addedVol: null },
    { m: 5,  t: 'oil_topup',  vol: null, addedVol: 3 },
    { m: 6,  t: 'oil_change', vol: 49,  addedVol: null },
    { m: 8,  t: 'oil_topup',  vol: null, addedVol: 5 },
    { m: 9,  t: 'oil_change', vol: 51,  addedVol: null },
    { m: 11, t: 'oil_topup',  vol: null, addedVol: 4 },
    { m: 12, t: 'oil_change', vol: 50,  addedVol: null },
    { m: 14, t: 'oil_topup',  vol: null, addedVol: 3 },
    { m: 15, t: 'oil_change', vol: 53,  addedVol: null },
  ]},
];

function addMonths(base, months) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  // add small random day offset ±5
  d.setDate(Math.max(1, d.getDate() + Math.floor(Math.random() * 11) - 5));
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }
    const db = base44.asServiceRole;

    const [points, units, oils, existingEvents, lifecycles] = await Promise.all([
      db.entities.SamplingPoint.list(undefined, 500),
      db.entities.EquipmentUnit.list(undefined, 500),
      db.entities.OilReference.list(undefined, 100),
      db.entities.MaintenanceEvent.list(undefined, 2000),
      db.entities.OilLifecycle.list(undefined, 1000),
    ]);

    if (!oils.length || !points.length) {
      return Response.json({ error: 'No reference data found. Run seedDonRechFlot first.' }, { status: 400 });
    }

    // Delete existing events (max 50 to avoid timeout)
    const toDelete = existingEvents.slice(0, 50);
    for (let i = 0; i < toDelete.length; i++) {
      await db.entities.MaintenanceEvent.delete(toDelete[i].id);
      await sleep(150);
    }

    // Select diverse points: up to 5 main engines + 5 aux engines
    const mainPoints = points.filter(pt => {
      const u = units.find(u => u.id === pt.equipment_unit_id);
      return u?.equipment_type === 'main_engine';
    }).slice(0, 5);

    const auxPoints = points.filter(pt => {
      const u = units.find(u => u.id === pt.equipment_unit_id);
      return u?.equipment_type === 'aux_engine';
    }).slice(0, 5);

    const selectedPoints = [
      ...mainPoints.map(p => ({ point: p, scenario: SCENARIOS[0] })),
      ...auxPoints.map(p => ({ point: p, scenario: SCENARIOS[1] })),
    ];

    const BASE_DATE = '2025-01-01';
    const BASE_HOURS = 6000;
    const HOURS_PER_MONTH = { main_engine: 200, aux_engine: 150 };

    let created = 0;
    const summary = {};

    for (const { point, scenario } of selectedPoints) {
      const unit = units.find(u => u.id === point.equipment_unit_id);
      const hpm = HOURS_PER_MONTH[unit?.equipment_type] || 150;
      const oilTypeId = point.oil_type_id || oils[0].id;
      const lc = lifecycles.find(l => l.sampling_point_id === point.id);
      const baseH = lc?.start_operating_hours || BASE_HOURS;

      for (const ev of scenario.events) {
        const eventDate = addMonths(BASE_DATE, ev.m);
        if (eventDate > '2026-05-30') continue;

        const hoursAtEvent = baseH + Math.round(ev.m * hpm * (0.9 + Math.random() * 0.2));

        const record = {
          event_type: ev.t,
          event_date: eventDate,
          client_id: point.client_id,
          asset_id: point.asset_id,
          equipment_unit_id: point.equipment_unit_id,
          sampling_point_id: point.id,
          total_operating_hours: hoursAtEvent,
        };

        if (ev.t === 'oil_change') {
          record.old_oil_type_id = oilTypeId;
          record.new_oil_type_id = oilTypeId;
          record.replaced_oil_volume = ev.vol + Math.round((Math.random() - 0.5) * 6);
          record.comment = `Плановая замена масла, наработка ${hoursAtEvent} м/ч`;
        } else {
          record.added_oil_volume = (ev.addedVol || 5) + Math.round((Math.random() - 0.5) * 2);
          record.comment = `Долив масла ${record.added_oil_volume} л`;
        }

        await db.entities.MaintenanceEvent.create(record);
        summary[ev.t] = (summary[ev.t] || 0) + 1;
        created++;
        await sleep(180);
      }
    }

    return Response.json({
      success: true,
      deleted: toDelete.length,
      created,
      breakdown: summary,
      points_processed: selectedPoints.length,
      message: `Удалено ${toDelete.length} старых событий. Создано ${created} событий для ${selectedPoints.length} точек (${mainPoints.length} гл.дв. + ${auxPoints.length} вспом.дв.)`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});