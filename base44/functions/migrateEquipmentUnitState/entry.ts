/**
 * One-time migration: recalculates current_total_hours / current_oil_hours
 * for ALL EquipmentUnits by replaying their MaintenanceEvent history.
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function recalcUnit(base44, unit) {
  const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({ equipment_unit_id: unit.id });
  events.sort((a, b) => {
    const d = (a.event_date || '').localeCompare(b.event_date || '');
    if (d !== 0) return d;
    return (a.created_date || '').localeCompare(b.created_date || '');
  });

  const initialTotal = unit.total_operating_hours ?? 0;
  const initialOil = unit.initial_oil_hours ?? 0;
  let lastResetTotal = initialTotal;
  let lastResetOilHours = initialOil;
  let currentTotal = initialTotal;
  let currentOilType = unit.current_oil_type_id || unit.oil_type_id || null;
  let lastDate = null;

  for (const event of events) {
    if (event.total_operating_hours != null) currentTotal = event.total_operating_hours;
    if (event.event_type === 'oil_change') {
      lastResetTotal = event.total_operating_hours ?? currentTotal;
      lastResetOilHours = event.oil_hours ?? 0;
      if (event.new_oil_type_id) currentOilType = event.new_oil_type_id;
    } else if (event.event_type === 'hour_reading' && event.oil_hours != null) {
      lastResetTotal = event.total_operating_hours ?? currentTotal;
      lastResetOilHours = event.oil_hours;
    }
    if (event.event_date) lastDate = event.event_date;
  }

  const currentOilHours = Math.max(0, lastResetOilHours + (currentTotal - lastResetTotal));
  await base44.asServiceRole.entities.EquipmentUnit.update(unit.id, {
    current_total_hours: currentTotal,
    current_oil_hours: currentOilHours,
    current_oil_type_id: currentOilType,
    last_hours_update_date: lastDate,
  });
  return { current_total_hours: currentTotal, current_oil_hours: currentOilHours };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const units = await base44.asServiceRole.entities.EquipmentUnit.list(undefined, 500);

    let processed = 0;
    const errors = [];

    for (const unit of units) {
      try {
        await recalcUnit(base44, unit);
        processed++;
      } catch (err) {
        errors.push({ id: unit.id, name: unit.unit_name, error: err.message });
      }
    }

    return Response.json({ success: true, total: units.length, processed, failed: errors.length, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});