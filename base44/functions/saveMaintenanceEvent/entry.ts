import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Unified backend function for desktop MaintenanceEvents CRUD.
 * Handles create / update / delete with proper OilLifecycle management and RBAC.
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

      // RBAC
      const rbacError = checkAccess(user, existing);
      if (rbacError) return rbacError;

      await base44.asServiceRole.entities.MaintenanceEvent.delete(event_id);

      // Recalculate unit state
      if (existing.equipment_unit_id) {
        await recalcUnit(base44, existing.equipment_unit_id, user);
      }

      return Response.json({ success: true });
    }

    // ── CREATE / UPDATE ──────────────────────────────────────────────────────
    if (!event_data) return Response.json({ error: 'event_data is required' }, { status: 400 });

    // RBAC
    const rbacError = checkAccess(user, event_data);
    if (rbacError) return rbacError;

    // Sanitise numbers
    const payload = { ...event_data };
    if (payload.total_operating_hours === '' || payload.total_operating_hours === undefined) delete payload.total_operating_hours;
    else if (payload.total_operating_hours !== undefined) payload.total_operating_hours = Number(payload.total_operating_hours);
    if (payload.oil_hours === '' || payload.oil_hours === undefined) delete payload.oil_hours;
    else if (payload.oil_hours !== undefined) payload.oil_hours = Number(payload.oil_hours);
    if (payload.replaced_oil_volume === '' || payload.replaced_oil_volume === undefined) delete payload.replaced_oil_volume;
    else if (payload.replaced_oil_volume !== undefined) payload.replaced_oil_volume = Number(payload.replaced_oil_volume);
    if (payload.added_oil_volume === '' || payload.added_oil_volume === undefined) delete payload.added_oil_volume;
    else if (payload.added_oil_volume !== undefined) payload.added_oil_volume = Number(payload.added_oil_volume);

    let savedEvent;
    if (action === 'update' && event_id) {
      savedEvent = await base44.asServiceRole.entities.MaintenanceEvent.update(event_id, payload);
    } else {
      savedEvent = await base44.asServiceRole.entities.MaintenanceEvent.create(payload);
    }

    // OilLifecycle management for oil_change
    if (event_data.event_type === 'oil_change' && event_data.sampling_point_id) {
      // Close ALL active lifecycles for this sampling point
      const allLC = await base44.asServiceRole.entities.OilLifecycle.filter({ sampling_point_id: event_data.sampling_point_id });
      const activeLC = allLC.filter(l => l.status === 'active');
      for (const lc of activeLC) {
        await base44.asServiceRole.entities.OilLifecycle.update(lc.id, {
          status: 'closed',
          end_date: event_data.event_date,
          end_operating_hours: event_data.total_operating_hours,
          end_reason: 'Замена масла',
        });
      }

      // Create new lifecycle only if none exists with same start_date + oil_type
      if (event_data.new_oil_type_id) {
        const duplicate = allLC.find(l =>
          l.start_date === event_data.event_date &&
          l.oil_type_id === event_data.new_oil_type_id &&
          l.status === 'active'
        );
        if (!duplicate) {
          await base44.asServiceRole.entities.OilLifecycle.create({
            sampling_point_id: event_data.sampling_point_id,
            oil_type_id: event_data.new_oil_type_id,
            start_date: event_data.event_date,
            start_operating_hours: event_data.total_operating_hours,
            status: 'active',
            start_reason: 'Замена масла',
          });
        }
      }
    }

    // Recalculate equipment unit state
    if (event_data.equipment_unit_id) {
      await recalcUnit(base44, event_data.equipment_unit_id, user);
    }

    return Response.json({ success: true, event: savedEvent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

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

async function recalcUnit(base44, equipment_unit_id, user) {
  const unit = await base44.asServiceRole.entities.EquipmentUnit.get(equipment_unit_id);
  if (!unit) return;

  const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({ equipment_unit_id });
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

  const currentOilHours = lastResetOilHours + (currentTotal - lastResetTotal);
  await base44.asServiceRole.entities.EquipmentUnit.update(equipment_unit_id, {
    current_total_hours: currentTotal,
    current_oil_hours: Math.max(0, currentOilHours),
    current_oil_type_id: currentOilType,
    last_hours_update_date: lastDate,
  });
}