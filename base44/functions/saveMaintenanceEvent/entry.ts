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

    let existing = null;

    if (action === 'update') {
      if (!event_id) return Response.json({ error: 'event_id is required for update' }, { status: 400 });
      existing = await base44.asServiceRole.entities.MaintenanceEvent.get(event_id);
      if (!existing) return Response.json({ error: 'Event not found' }, { status: 404 });

      // RBAC: check against the existing record (can't bypass by changing client/asset in payload)
      const rbacOnExisting = checkAccess(user, existing);
      if (rbacOnExisting) return rbacOnExisting;

      // RBAC: also check that new target is accessible (prevent moving to another client/asset)
      const rbacOnNew = checkAccess(user, event_data);
      if (rbacOnNew) return rbacOnNew;
    } else {
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

    // Collect ALL affected sampling_point_ids and equipment_unit_ids
    // (covers the case where sampling_point or unit changed on update)
    const affectedPointIds = unique([
      existing?.sampling_point_id,
      event_data.sampling_point_id,
    ]);
    const affectedUnitIds = unique([
      existing?.equipment_unit_id,
      event_data.equipment_unit_id,
    ]);

    for (const ptId of affectedPointIds) {
      await rebuildLifecycles(base44, ptId);
    }
    for (const unitId of affectedUnitIds) {
      await recalcUnit(base44, unitId);
    }

    return Response.json({ success: true, event: savedEvent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── HELPERS ───────────────────────────────────────────────────────────────────

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function checkAccess(user, event) {
  if (user.role === 'captain') {
    const allowedAssetIds = user.asset_ids?.length ? user.asset_ids : user.asset_id ? [user.asset_id] : [];
    if (!event.asset_id || !allowedAssetIds.includes(event.asset_id)) {
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

/**
 * Rebuilds OilLifecycle records for a sampling point by replaying all oil_change
 * MaintenanceEvents in chronological order.
 *
 * Safe strategy: delete old records, create new ones, then re-link OilSample.lifecycle_id
 * so that existing samples still point to the correct (new) lifecycle by date.
 */
async function rebuildLifecycles(base44, sampling_point_id) {
  if (!sampling_point_id) return;

  // 1. Build ordered oil_change events
  const allEvents = await base44.asServiceRole.entities.MaintenanceEvent.filter({ sampling_point_id });
  const oilChanges = allEvents
    .filter(e => e.event_type === 'oil_change')
    .sort((a, b) => {
      const d = (a.event_date || '').localeCompare(b.event_date || '');
      return d !== 0 ? d : (a.created_date || '').localeCompare(b.created_date || '');
    });

  // 2. Delete existing lifecycle records for this point
  const existingLCs = await base44.asServiceRole.entities.OilLifecycle.filter({ sampling_point_id });
  for (const lc of existingLCs) {
    await base44.asServiceRole.entities.OilLifecycle.delete(lc.id);
  }

  // 3. Recreate lifecycles from oil_change events and remember date→id mapping
  // Each lifecycle covers [oilChanges[i].event_date, oilChanges[i+1].event_date)
  const newLifecycles = []; // { id, start_date, end_date|null }
  for (let i = 0; i < oilChanges.length; i++) {
    const ev = oilChanges[i];
    if (!ev.new_oil_type_id) continue;

    const nextEv = oilChanges[i + 1];
    const isLast = !nextEv;

    const created = await base44.asServiceRole.entities.OilLifecycle.create({
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

    newLifecycles.push({
      id: created.id,
      start_date: ev.event_date,
      end_date: isLast ? null : nextEv.event_date,
    });
  }

  // 4. Re-link OilSample.lifecycle_id for all samples of this point.
  // Always fetch samples — even if no lifecycles exist, stale refs must be cleared.
  const samples = await base44.asServiceRole.entities.OilSample.filter({ sampling_point_id });
  for (const sample of samples) {
    if (newLifecycles.length === 0) {
      // No lifecycles at all — clear any stale reference
      if (sample.lifecycle_id) {
        await base44.asServiceRole.entities.OilSample.update(sample.id, { lifecycle_id: null });
      }
      continue;
    }

    if (!sample.sampling_date) {
      if (sample.lifecycle_id) {
        await base44.asServiceRole.entities.OilSample.update(sample.id, { lifecycle_id: null });
      }
      continue;
    }

    // Find the lifecycle whose window [start_date, end_date) contains this sample's date
    const matched = newLifecycles.find(lc => {
      const afterStart = sample.sampling_date >= lc.start_date;
      const beforeEnd = !lc.end_date || sample.sampling_date < lc.end_date;
      return afterStart && beforeEnd;
    });

    if (matched) {
      if (sample.lifecycle_id !== matched.id) {
        await base44.asServiceRole.entities.OilSample.update(sample.id, { lifecycle_id: matched.id });
      }
    } else {
      // Sample date doesn't fall into any lifecycle window — clear stale ref
      if (sample.lifecycle_id) {
        await base44.asServiceRole.entities.OilSample.update(sample.id, { lifecycle_id: null });
      }
    }
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
