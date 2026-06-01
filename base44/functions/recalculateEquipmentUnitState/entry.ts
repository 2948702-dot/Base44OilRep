import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Recalculates current_total_hours, current_oil_hours, current_oil_type_id
 * for an EquipmentUnit by replaying all MaintenanceEvents in chronological order.
 *
 * Algorithm:
 *   - Start from initial values (total_operating_hours, initial_oil_hours)
 *   - Track "last oil reset point": the total hours and oil hours at the last oil_change
 *     (or at start if no oil_change exists)
 *   - current_oil_hours = lastResetOilHours + (currentTotal - lastResetTotal)
 *   - hour_reading with explicit oil_hours resets the reference point
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { equipment_unit_id } = body;
    if (!equipment_unit_id) {
      return Response.json({ error: 'equipment_unit_id is required' }, { status: 400 });
    }

    // Fetch unit
    const unit = await base44.asServiceRole.entities.EquipmentUnit.get(equipment_unit_id);
    if (!unit) {
      return Response.json({ error: 'Equipment unit not found' }, { status: 404 });
    }

    // RBAC: check user has access to this unit
    if (user.role === 'captain') {
      const allowedAssetIds = user.asset_ids?.length ? user.asset_ids : user.asset_id ? [user.asset_id] : [];
      if (!unit.asset_id || !allowedAssetIds.includes(unit.asset_id)) {
        return Response.json({ error: 'Forbidden: asset mismatch' }, { status: 403 });
      }
    } else if (user.role === 'superintendent') {
      if (!unit.client_id || unit.client_id !== user.client_id) {
        return Response.json({ error: 'Forbidden: client mismatch' }, { status: 403 });
      }
    } else if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
    }

    // Fetch all events for this unit
    const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({ equipment_unit_id });

    // Sort: by event_date ASC, then created_date ASC
    events.sort((a, b) => {
      const d = (a.event_date || '').localeCompare(b.event_date || '');
      if (d !== 0) return d;
      return (a.created_date || '').localeCompare(b.created_date || '');
    });

    // Initial state from unit
    const initialTotal = unit.total_operating_hours ?? 0;
    const initialOil = unit.initial_oil_hours ?? 0;

    // The "reference point" for oil hours calculation
    // current_oil_hours = lastResetOilHours + (currentTotal - lastResetTotal)
    let lastResetTotal = initialTotal;
    let lastResetOilHours = initialOil;
    let currentTotal = initialTotal;
    let currentOilType = unit.current_oil_type_id || unit.oil_type_id || null;
    let lastDate = null;

    for (const event of events) {
      if (event.total_operating_hours != null) {
        currentTotal = event.total_operating_hours;
      }

      if (event.event_type === 'oil_change') {
        // Reset oil reference to this point
        lastResetTotal = event.total_operating_hours ?? currentTotal;
        lastResetOilHours = event.oil_hours ?? 0; // usually 0 after oil change
        if (event.new_oil_type_id) {
          currentOilType = event.new_oil_type_id;
        }
      } else if (event.event_type === 'hour_reading' && event.oil_hours != null) {
        // Explicit oil hours reading — reset reference point
        lastResetTotal = event.total_operating_hours ?? currentTotal;
        lastResetOilHours = event.oil_hours;
      }
      // oil_topup: just advances total, oil hours accumulate automatically (no reset)

      if (event.event_date) {
        lastDate = event.event_date;
      }
    }

    const currentOilHours = lastResetOilHours + (currentTotal - lastResetTotal);

    await base44.asServiceRole.entities.EquipmentUnit.update(equipment_unit_id, {
      current_total_hours: currentTotal,
      current_oil_hours: Math.max(0, currentOilHours),
      current_oil_type_id: currentOilType,
      last_hours_update_date: lastDate
    });

    return Response.json({
      success: true,
      equipment_unit_id,
      current_total_hours: currentTotal,
      current_oil_hours: Math.max(0, currentOilHours),
      current_oil_type_id: currentOilType,
      last_hours_update_date: lastDate
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
