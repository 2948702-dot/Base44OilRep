/**
 * Handles oil_change / oil_topup events from mobile.
 * Captains can't write OilLifecycle directly (RLS), so lifecycle ops run via service role here.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function recalcUnit(base44, unitId) {
  const unit = await base44.asServiceRole.entities.EquipmentUnit.get(unitId);
  if (!unit) return;
  const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({ equipment_unit_id: unitId });
  events.sort((a, b) => {
    const d = (a.event_date || '').localeCompare(b.event_date || '');
    if (d !== 0) return d;
    return (a.created_date || '').localeCompare(b.created_date || '');
  });
  const initialTotal = unit.total_operating_hours ?? 0;
  const initialOil = unit.initial_oil_hours ?? 0;
  let lastResetTotal = initialTotal, lastResetOilHours = initialOil;
  let currentTotal = initialTotal, currentOilType = unit.current_oil_type_id || unit.oil_type_id || null, lastDate = null;
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
  await base44.asServiceRole.entities.EquipmentUnit.update(unitId, {
    current_total_hours: currentTotal,
    current_oil_hours: Math.max(0, lastResetOilHours + (currentTotal - lastResetTotal)),
    current_oil_type_id: currentOilType,
    last_hours_update_date: lastDate,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode, base: baseData, oil_type_id, volume, filter_changed, sampling_point_id } = await req.json();

    if (!mode || !baseData) return Response.json({ error: 'Missing required fields' }, { status: 400 });

    // Role-based authorization: verify user has access to the submitted asset/client.
    // This prevents privilege escalation via asServiceRole by accepting arbitrary IDs from the frontend.
    if (user.role === 'captain') {
      if (!baseData.asset_id || baseData.asset_id !== user.asset_id) {
        return Response.json({ error: 'Forbidden: asset mismatch' }, { status: 403 });
      }
    } else if (user.role === 'superintendent') {
      if (!baseData.client_id || baseData.client_id !== user.client_id) {
        return Response.json({ error: 'Forbidden: client mismatch' }, { status: 403 });
      }
    } else if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
    }

    const today = baseData.event_date;
    const unitId = baseData.equipment_unit_id;

    // 1. Create MaintenanceEvent (user-scoped — captains have RLS permission)
    if (mode === 'topup') {
      await base44.entities.MaintenanceEvent.create({
        ...baseData,
        event_type: 'oil_topup',
        new_oil_type_id: oil_type_id || undefined,
        added_oil_volume: volume ? Number(volume) : undefined,
      });
    } else if (mode === 'change') {
      // Get current oil type from EquipmentUnit (service role for reliability)
      let oldOilTypeId;
      try {
        const unit = await base44.asServiceRole.entities.EquipmentUnit.get(unitId);
        oldOilTypeId = unit?.current_oil_type_id || unit?.oil_type_id;
      } catch (_) {}

      await base44.entities.MaintenanceEvent.create({
        ...baseData,
        event_type: 'oil_change',
        old_oil_type_id: oldOilTypeId || undefined,
        new_oil_type_id: oil_type_id || undefined,
        replaced_oil_volume: volume ? Number(volume) : undefined,
      });

      if (filter_changed) {
        await base44.entities.MaintenanceEvent.create({ ...baseData, event_type: 'oil_filter' });
      }

      // 2. OilLifecycle ops via service role (captain has no RLS to OilLifecycle)
      if (sampling_point_id) {
        const existingLCs = await base44.asServiceRole.entities.OilLifecycle.filter({
          sampling_point_id,
          status: 'active',
        });
        // Close all active lifecycles for this point (idempotent — may be 0 or 1)
        for (const lc of existingLCs) {
          await base44.asServiceRole.entities.OilLifecycle.update(lc.id, {
            status: 'closed',
            end_date: today,
            end_operating_hours: baseData.total_operating_hours,
            end_reason: 'Замена масла',
          });
        }
        // Create new lifecycle only if oil type specified
        if (oil_type_id) {
          await base44.asServiceRole.entities.OilLifecycle.create({
            sampling_point_id,
            oil_type_id,
            start_date: today,
            start_operating_hours: baseData.total_operating_hours,
            status: 'active',
            start_reason: 'Замена масла',
          });
        }
      }
    }

    // 3. Recalculate equipment unit state (inlined — function-to-function calls not supported)
    let updatedUnit = null;
    if (unitId) {
      await recalcUnit(base44, unitId);
      updatedUnit = await base44.asServiceRole.entities.EquipmentUnit.get(unitId);
    }

    return Response.json({ success: true, updated_unit: updatedUnit });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});