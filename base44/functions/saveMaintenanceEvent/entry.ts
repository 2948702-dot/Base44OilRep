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

      if (existing.equipment_unit_id) {
        await rebuildLifecycles(base44, existing.equipment_unit_id);
        await recalcUnit(base44, existing.equipment_unit_id);
        await rebuildMaintenanceSchedules(base44, existing.equipment_unit_id);
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

    // Rebuild both units when an event is moved during update.
    const affectedUnitIds = unique([
      existing?.equipment_unit_id,
      event_data.equipment_unit_id,
    ]);

    for (const unitId of affectedUnitIds) {
      await rebuildLifecycles(base44, unitId);
      await recalcUnit(base44, unitId);
      await rebuildMaintenanceSchedules(base44, unitId);
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
    const allowedAssetIds = getAllowedAssetIds(user);
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

function getAllowedAssetIds(user) {
  return unique([
    user.asset_id,
    ...(Array.isArray(user.asset_ids) ? user.asset_ids : []),
  ]);
}

/**
 * Rebuilds OilLifecycle records for an equipment unit by replaying all oil_change
 * MaintenanceEvents in chronological order.
 *
 * Safe strategy: delete old records, create new ones, then re-link OilSample.lifecycle_id
 * so that existing samples still point to the correct (new) lifecycle by date.
 */
async function rebuildLifecycles(base44, equipment_unit_id) {
  if (!equipment_unit_id) return;

  // 1. Build ordered oil_change events
  const unit = await base44.asServiceRole.entities.EquipmentUnit.get(equipment_unit_id);
  if (!unit) return;
  const allEvents = await base44.asServiceRole.entities.MaintenanceEvent.filter({
    equipment_unit_id,
  });
  const oilChanges = allEvents
    .filter(e => e.event_type === 'oil_change')
    .sort((a, b) => {
      const d = (a.event_date || '').localeCompare(b.event_date || '');
      return d !== 0 ? d : (a.created_date || '').localeCompare(b.created_date || '');
    });

  // 2. Delete existing lifecycle records for this unit
  const existingLCs = await base44.asServiceRole.entities.OilLifecycle.filter({
    equipment_unit_id,
  });
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
      client_id: unit.client_id,
      asset_id: unit.asset_id,
      equipment_unit_id,
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

  // 4. Re-link OilSample.lifecycle_id for all samples of this unit.
  // Always fetch samples — even if no lifecycles exist, stale refs must be cleared.
  const samples = await base44.asServiceRole.entities.OilSample.filter({
    equipment_unit_id,
  });
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

function daysBetween(actualDate, plannedDate) {
  if (!actualDate || !plannedDate) return null;
  const actual = new Date(`${actualDate}T00:00:00Z`);
  const planned = new Date(`${plannedDate}T00:00:00Z`);
  if (Number.isNaN(actual.getTime()) || Number.isNaN(planned.getTime())) return null;
  return Math.round((actual - planned) / 86400000);
}

function addDays(date, days) {
  if (!date || !Number.isFinite(days)) return null;
  const result = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(result.getTime())) return null;
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function isOilChangeSchedule(schedule) {
  if (schedule.event_type) return schedule.event_type === 'oil_change';
  return /oil|масл/i.test(schedule.maintenance_type || '');
}

function calculateScheduleStatus(schedule, currentHours) {
  const updates = {};
  let status = 'normal';

  if (
    (schedule.planning_method === 'hours' || schedule.planning_method === 'whichever_first')
    && schedule.target_hours != null
    && currentHours != null
  ) {
    updates.current_hours = currentHours;
    updates.remaining_hours = Number(schedule.target_hours) - Number(currentHours);
    if (updates.remaining_hours < 0) status = 'overdue';
    else if (updates.remaining_hours < 100) status = 'due_soon';
  }

  if (
    (schedule.planning_method === 'date' || schedule.planning_method === 'whichever_first')
    && schedule.target_date
  ) {
    updates.remaining_days = daysBetween(schedule.target_date, new Date().toISOString().slice(0, 10));
    if (updates.remaining_days < 0) status = 'overdue';
    else if (updates.remaining_days < 14 && status !== 'overdue') status = 'due_soon';
  }

  updates.status = status;
  return updates;
}

async function rebuildMaintenanceSchedules(base44, equipment_unit_id) {
  if (!equipment_unit_id) return;

  const unit = await base44.asServiceRole.entities.EquipmentUnit.get(equipment_unit_id);
  if (!unit) return;

  const schedules = await base44.asServiceRole.entities.MaintenanceSchedule.filter({
    equipment_unit_id,
  });
  if (schedules.length === 0) return;

  const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({
    equipment_unit_id,
  });
  const oilChanges = events
    .filter(event => event.event_type === 'oil_change')
    .sort((a, b) => {
      const dateCompare = (a.event_date || '').localeCompare(b.event_date || '');
      return dateCompare !== 0
        ? dateCompare
        : (a.created_date || '').localeCompare(b.created_date || '');
    });

  for (const schedule of schedules) {
    if (!isOilChangeSchedule(schedule)) {
      await base44.asServiceRole.entities.MaintenanceSchedule.update(
        schedule.id,
        calculateScheduleStatus(schedule, unit.current_total_hours),
      );
      continue;
    }

    let targetHours = schedule.initial_target_hours ?? schedule.target_hours ?? null;
    let targetDate = schedule.initial_target_date ?? schedule.target_date ?? null;
    let latest = null;
    let completedCount = 0;

    for (const event of oilChanges) {
      const hoursVariance = targetHours != null && event.total_operating_hours != null
        ? Number(event.total_operating_hours) - Number(targetHours)
        : null;
      const dateVariance = daysBetween(event.event_date, targetDate);

      latest = {
        event,
        plannedHours: targetHours,
        plannedDate: targetDate,
        hoursVariance,
        dateVariance,
      };
      completedCount += 1;

      if (schedule.interval_hours != null && event.total_operating_hours != null) {
        targetHours = Number(event.total_operating_hours) + Number(schedule.interval_hours);
      }
      if (schedule.interval_days != null && event.event_date) {
        targetDate = addDays(event.event_date, Number(schedule.interval_days));
      }
    }

    const updates = {
      initial_target_hours: schedule.initial_target_hours ?? schedule.target_hours ?? null,
      initial_target_date: schedule.initial_target_date ?? schedule.target_date ?? null,
      target_hours: targetHours,
      target_date: targetDate,
      completed_count: completedCount,
      last_completed_event_id: latest?.event.id ?? null,
      last_completed_date: latest?.event.event_date ?? null,
      last_completed_hours: latest?.event.total_operating_hours ?? null,
      last_planned_date: latest?.plannedDate ?? null,
      last_planned_hours: latest?.plannedHours ?? null,
      last_date_variance_days: latest?.dateVariance ?? null,
      last_hours_variance: latest?.hoursVariance ?? null,
      last_completion_status: latest
        ? (
            (latest.dateVariance ?? latest.hoursVariance ?? 0) > 0
              ? 'late'
              : (latest.dateVariance ?? latest.hoursVariance ?? 0) < 0
                ? 'early'
                : 'on_time'
          )
        : null,
    };

    Object.assign(updates, calculateScheduleStatus(
      { ...schedule, target_hours: targetHours, target_date: targetDate },
      unit.current_total_hours,
    ));

    await base44.asServiceRole.entities.MaintenanceSchedule.update(schedule.id, updates);
  }
}
