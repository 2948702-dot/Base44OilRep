import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Admin-only migration: copies oil_type_id and oil_volume from legacy SamplingPoint records
 * to the linked EquipmentUnit if the unit is missing those values.
 * After migration, recalculateEquipmentUnitState is called for each affected unit.
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

    const results = { migrated: 0, skipped: 0, errors: [] };
    const affectedUnitIds = new Set();

    for (const point of pointsWithOil) {
      if (!point.equipment_unit_id) { results.skipped++; continue; }

      const unit = await base44.asServiceRole.entities.EquipmentUnit.get(point.equipment_unit_id);
      if (!unit) { results.skipped++; continue; }

      const updates = {};
      if (!unit.oil_type_id && point.oil_type_id) updates.oil_type_id = point.oil_type_id;
      if (!unit.oil_volume && point.oil_volume) updates.oil_volume = point.oil_volume;

      if (Object.keys(updates).length === 0) { results.skipped++; continue; }

      await base44.asServiceRole.entities.EquipmentUnit.update(unit.id, updates);
      affectedUnitIds.add(unit.id);
      results.migrated++;
    }

    // Recalculate state for each affected unit
    const recalcResults = [];
    for (const unitId of affectedUnitIds) {
      const res = await base44.asServiceRole.functions.invoke('recalculateEquipmentUnitState', { equipment_unit_id: unitId });
      recalcResults.push({ unitId, ok: !!res });
    }

    return Response.json({
      success: true,
      migrated: results.migrated,
      skipped: results.skipped,
      recalculated: recalcResults.length,
      errors: results.errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});