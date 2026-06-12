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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getAllowedAssetIds(user) {
  return unique([
    user.asset_id,
    ...(Array.isArray(user.asset_ids) ? user.asset_ids : []),
  ]);
}

async function rebuildLifecycles(base44, equipmentUnitId) {
  const unit = await base44.asServiceRole.entities.EquipmentUnit.get(equipmentUnitId);
  if (!unit) return;
  const events = await base44.asServiceRole.entities.MaintenanceEvent.filter({
    equipment_unit_id: equipmentUnitId,
  });
  const oilChanges = events
    .filter(event => event.event_type === 'oil_change')
    .sort((a, b) => {
      const dateCompare = (a.event_date || '').localeCompare(b.event_date || '');
      return dateCompare !== 0
        ? dateCompare
        : (a.created_date || '').localeCompare(b.created_date || '');
    });

  const existing = await base44.asServiceRole.entities.OilLifecycle.filter({
    equipment_unit_id: equipmentUnitId,
  });
  for (const lifecycle of existing) {
    await base44.asServiceRole.entities.OilLifecycle.delete(lifecycle.id);
  }

  const rebuilt = [];
  for (let index = 0; index < oilChanges.length; index += 1) {
    const event = oilChanges[index];
    if (!event.new_oil_type_id) continue;
    const nextEvent = oilChanges[index + 1];
    const created = await base44.asServiceRole.entities.OilLifecycle.create({
      client_id: unit.client_id,
      asset_id: unit.asset_id,
      equipment_unit_id: equipmentUnitId,
      oil_type_id: event.new_oil_type_id,
      start_date: event.event_date,
      start_operating_hours: event.total_operating_hours,
      start_reason: 'Замена масла',
      status: nextEvent ? 'closed' : 'active',
      ...(nextEvent ? {
        end_date: nextEvent.event_date,
        end_operating_hours: nextEvent.total_operating_hours,
        end_reason: 'Замена масла',
      } : {}),
    });
    rebuilt.push({
      id: created.id,
      start_date: event.event_date,
      end_date: nextEvent?.event_date || null,
    });
  }

  const samples = await base44.asServiceRole.entities.OilSample.filter({
    equipment_unit_id: equipmentUnitId,
  });
  for (const sample of samples) {
    const matched = sample.sampling_date
      ? rebuilt.find(lifecycle => (
          sample.sampling_date >= lifecycle.start_date
          && (!lifecycle.end_date || sample.sampling_date < lifecycle.end_date)
        ))
      : null;
    const lifecycleId = matched?.id || null;
    if ((sample.lifecycle_id || null) !== lifecycleId) {
      await base44.asServiceRole.entities.OilSample.update(sample.id, {
        lifecycle_id: lifecycleId,
      });
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode, base: baseData, oil_type_id, volume, filter_changed } = await req.json();

    if (!mode || !baseData) return Response.json({ error: 'Missing required fields' }, { status: 400 });

    // Role-based authorization: verify user has access to the submitted asset/client.
    // This prevents privilege escalation via asServiceRole by accepting arbitrary IDs from the frontend.
    if (user.role === 'captain') {
      const allowedAssetIds = getAllowedAssetIds(user);
      if (!baseData.asset_id || !allowedAssetIds.includes(baseData.asset_id)) {
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

    // 1. Create MaintenanceEvent through service role after explicit RBAC above.
    // This also supports responsible users assigned through user.asset_ids.
    if (mode === 'topup') {
      await base44.asServiceRole.entities.MaintenanceEvent.create({
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

      await base44.asServiceRole.entities.MaintenanceEvent.create({
        ...baseData,
        event_type: 'oil_change',
        old_oil_type_id: oldOilTypeId || undefined,
        new_oil_type_id: oil_type_id || undefined,
        replaced_oil_volume: volume ? Number(volume) : undefined,
      });

      if (filter_changed) {
        await base44.asServiceRole.entities.MaintenanceEvent.create({
          ...baseData,
          event_type: 'oil_filter',
        });
      }

      // 2. One equipment unit has one oil lifecycle.
      await rebuildLifecycles(base44, unitId);
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
