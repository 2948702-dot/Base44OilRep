import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Admin-only migration: copies oil_type_id and oil_volume from legacy SamplingPoint records
 * to the linked EquipmentUnit where the unit is missing those values.
 * Recalculates unit state inline (no function-to-function call).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const allPoints = await base44.asServiceRole.entities.SamplingPoint.list();
    const pointsWithOil = allPoints.filter(p => p.oil_type_id || p.oil_volume);

    const stats = { migrated: 0, skipped: 0, recalculated: 0 };
    const affectedUnitIds = new Set();

    // ── Step 1: copy oil fields from point → unit (if unit is missing them) ──
    for (const point of pointsWithOil) {
      if (!point.equipment_unit_id) { stats.skipped++; continue; }

      const unit = await base44.asServiceRole.entities.EquipmentUnit.get(point.equipment_unit_id);
      if (!unit) { stats.skipped++; continue; }

      const updates = {};
      if (!unit.oil_type_id && point.oil_type_id) updates.oil_type_id = point.oil_type_id;
      if (!unit.oil_volume && point.oil_volume)   updates.oil_volume  = point.oil_volume;

      if (Object.keys(updates).length === 0) { stats.skipped++; continue; }

      await base44.asServiceRole.entities.EquipmentUnit.update(unit.id, updates);
      affectedUnitIds.add(unit.id);
      stats.migrated++;
    }

    // ── Step 2: inline recalcUnit for each affected unit ────────────────────
    for (const equipment_unit_id of affectedUnitIds) {
      const unit = await base44.asServiceRole.entities.EquipmentUnit.get(equipment_unit_id);
      if (!unit) continue;

      const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({ equipment_unit_id });
      events.sort((a, b) => {
        const d = (a.event_date || '').localeCompare(b.event_date || '');
        return d !== 0 ? d : (a.created_date || '').localeCompare(b.created_date || '');
      });

      const initialTotal  = unit.total_operating_hours ?? 0;
      const initialOil    = unit.initial_oil_hours     ?? 0;
      let lastResetTotal  = initialTotal;
      let lastResetOilH   = initialOil;
      let currentTotal    = initialTotal;
      let currentOilType  = unit.current_oil_type_id || unit.oil_type_id || null;
      let lastDate        = null;

      for (const ev of events) {
        if (ev.total_operating_hours != null) currentTotal = ev.total_operating_hours;
        if (ev.event_type === 'oil_change') {
          lastResetTotal = ev.total_operating_hours ?? currentTotal;
          lastResetOilH  = ev.oil_hours ?? 0;
          if (ev.new_oil_type_id) currentOilType = ev.new_oil_type_id;
        } else if (ev.event_type === 'hour_reading' && ev.oil_hours != null) {
          lastResetTotal = ev.total_operating_hours ?? currentTotal;
          lastResetOilH  = ev.oil_hours;
        }
        if (ev.event_date) lastDate = ev.event_date;
      }

      const currentOilHours = lastResetOilH + (currentTotal - lastResetTotal);
      await base44.asServiceRole.entities.EquipmentUnit.update(equipment_unit_id, {
        current_total_hours:    currentTotal,
        current_oil_hours:      Math.max(0, currentOilHours),
        current_oil_type_id:    currentOilType,
        last_hours_update_date: lastDate,
      });

      stats.recalculated++;
    }

    return Response.json({
      success: true,
      migrated:     stats.migrated,
      skipped:      stats.skipped,
      recalculated: stats.recalculated,
      affectedUnitIds: [...affectedUnitIds],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});