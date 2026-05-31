import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Unified backend function for desktop MaintenanceEvents CRUD.
 * Handles create / update / delete with proper OilLifecycle rebuild and RBAC.
 *
 * Payload: { action: 'create'|'update'|'delete', event_data?: {...}, event_id?: string }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, event_data, event_id } = body;

    if (!action) return Response.json({ error: 'action is required' }, { status: 400 });

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!event_id) return Response.json({ error: 'event_id is required for delete' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.MaintenanceEvent.get(event_id);
      if (!existing) return Response.json({ error: 'Event not found' }, { status: 404 });

      const rbacError = checkAccess(user, existing);
      if (rbacError) return rbacError;

      await base44.asServiceRole.entities.MaintenanceEvent.delete(event_id);

      if (existing.sampling_point_id) {
        await rebuildLifecycles(base44, existing.sampling_point_id);
      }
      if (existing.equipment_unit_id) {
        await recalcUnit(base44, existing.equipment_unit_id);
      }

      return Response.json({ success: true });
    }

    // ── CREATE / UPDATE ──────────────────────────────────────────────────────
    if (!event_data) return Response.json({ error: 'event_data is required' }, { status: 400 });

    // For UPDATE: fetch existing record first and RBAC-check it before modifying
    if (action === 'update') {
      if (!event_id) return Response.json({ error: 'event_id is required for update' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.MaintenanceEvent.get(event_id);
      if (!existing) return Response.json({ error: 'Event not found' }, { status: 404 });

      // Check access on existing record
      const rbacOnExisting = checkAccess(user, existing);
      if (rbacOnExisting) return rbacOnExisting;

      // Prevent moving event to a different client/asset that user can't access
      const rbacOnNew = checkAccess(user, event_data);
      if (rbacOnNew) return rbacOnNew;
    } else {
      // CREATE: RBAC on new data
      const rbacError = checkAccess(user, event_data);
      if (rbacError) return rbacError;
    }

    // Sanitise numbers
    const payload = { ...event_data };
    for (const field of ['total_operating_hours', 'oil_hours', 'replaced_oil_volume', 'added_oil_volume']) {
      if (payload[field] === '' || payload[field] === undefined) delete payload[field];
      else if (payload[field] !== undefined) payload[field] = Number(payload[field]);
    }

    let savedEvent;
    if (action === 'update' && event_id) {
      savedEvent = await base44.asServiceRole.entities.MaintenanceEvent.update(event_id, payload);
    } else {
      savedEvent = await base44.asServiceRole.entities.MaintenanceEvent.create(payload);
    }

    // Rebuild OilLifecycle from full oil_change history for affected point
    const affectedPointId = event_data.sampling_point_id;
    if (affectedPointId) {
      await rebuildLifecycles(base44, affectedPointId);
    }

    // Recalculate equipment unit state
    if (event_data.equipment_unit_id) {
      await recalcUnit(base44, event_data.equipment_unit_id);
    }

    return Response.json({ success: true, event: savedEvent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── RBAC ─────────────────────────────────────────────────────────────────────
function checkAccess(user, event) {
  if (user.role === 'captain') {
    if (!event.asset_id || event.asset_id !== user.asset_id) {
      return Response.json({ error: 'Forbidden: asset mismatch' }, { status: 403 });
    }
  } else if (user.role === 'superintendent') {
    if (!event.client_id || event.client_id !== user.client_id) {
      return Response.json({ error: 'Forbidden: client mismatch' }, { status: 403 });
    }
  } else if (user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
  }
  return null;
}

// ── REBUILD LIFECYCLES ────────────────────────────────────────────────────────
/**
 * Rebuilds OilLifecycle records for a sampling point by replaying all oil_change
 * MaintenanceEvents in chronological order. This is the canonical approach:
 * OilLifecycle is a derived projection of the oil_change event log.
 */
async function rebuildLifecycles(base44, sampling_point_id) {
  if (!sampling_point_id) return;

  // Fetch all oil_change events for this point, sorted chronologically
  const allEvents = await base44.asServiceRole.entities.MaintenanceEvent.filter({ sampling_point_id });
  const oilChanges = allEvents
    .filter(e => e.event_type === 'oil_change')
    .sort((a, b) => {
      const d = (a.event_date || '').localeCompare(b.event_date || '');
      return d !== 0 ? d : (a.created_date || '').localeCompare(b.created_date || '');
    });

  // Delete all existing lifecycles for this point
  const existing = await base44.asServiceRole.entities.OilLifecycle.filter({ sampling_point_id });
  for (const lc of existing) {
    await base44.asServiceRole.entities.OilLifecycle.delete(lc.id);
  }

  // Recreate from oil_change events
  for (let i = 0; i < oilChanges.length; i++) {
    const ev = oilChanges[i];
    if (!ev.new_oil_type_id) continue;

    const nextEv = oilChanges[i + 1];
    const isLast = !nextEv;

    await base44.asServiceRole.entities.OilLifecycle.create({
      sampling_point_id,
      oil_type_id: ev.new_oil_type_id,
      start_date: ev.event_date,
      start_operating_hours: ev.total_operating_hours,
      start_reason: 'Замена масла',
      status: isLast ? 'active' : 'closed',
      ...(isLast ? {} : {
        end_date: nextEv.event_date,
        end_operating_hours: nextEv.total_operating_hours,
        end_reason: 'Замена масла',
      }),
    });
  }
}

// ── RECALC UNIT ───────────────────────────────────────────────────────────────
async function recalcUnit(base44, equipment_unit_id) {
  const unit = await base44.asServiceRole.entities.EquipmentUnit.get(equipment_unit_id);
  if (!unit) return;

  const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({ equipment_unit_id });
  events.sort((a, b) => {
    const d = (a.event_date || '').localeCompare(b.event_date || '');
    return d !== 0 ? d : (a.created_date || '').localeCompare(b.created_date || '');
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

  const currentOilHours = lastResetOilHours + (currentTotal - lastResetTotal);
  await base44.asServiceRole.entities.EquipmentUnit.update(equipment_unit_id, {
    current_total_hours: currentTotal,
    current_oil_hours: Math.max(0, currentOilHours),
    current_oil_type_id: currentOilType,
    last_hours_update_date: lastDate,
  });
}