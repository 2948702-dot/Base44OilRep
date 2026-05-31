import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function deleteInBatches(entity, ids, batchSize = 5, delayMs = 300) {
  let count = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(id => entity.delete(id)));
    count += batch.length;
    if (i + batchSize < ids.length) await delay(delayMs);
  }
  return count;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const deleted = {
      analysisResults: 0,
      maintenanceEvents: 0,
      oilLifecycles: 0,
      oilSamples: 0,
      samplingPoints: 0,
      equipmentUnits: 0,
      assets: 0
    };

    // Удалить AnalysisResults (зависят от OilSamples, удаляем первыми)
    const analysisResults = await base44.asServiceRole.entities.AnalysisResult.list('id', 2000);
    deleted.analysisResults = await deleteInBatches(
      base44.asServiceRole.entities.AnalysisResult,
      analysisResults.map(r => r.id)
    );
    await delay(500);

    // Удалить MaintenanceEvents
    const maintenanceEvents = await base44.asServiceRole.entities.MaintenanceEvent.list('id', 2000);
    deleted.maintenanceEvents = await deleteInBatches(
      base44.asServiceRole.entities.MaintenanceEvent,
      maintenanceEvents.map(e => e.id)
    );
    await delay(500);

    // Удалить OilLifecycles
    const oilLifecycles = await base44.asServiceRole.entities.OilLifecycle.list('id', 2000);
    deleted.oilLifecycles = await deleteInBatches(
      base44.asServiceRole.entities.OilLifecycle,
      oilLifecycles.map(l => l.id)
    );
    await delay(500);

    // Удалить OilSamples (загружать страницами — их может быть много)
    let oilSamples = await base44.asServiceRole.entities.OilSample.list('id', 2000);
    deleted.oilSamples = await deleteInBatches(
      base44.asServiceRole.entities.OilSample,
      oilSamples.map(s => s.id)
    );
    await delay(500);

    // Удалить SamplingPoints
    const samplingPoints = await base44.asServiceRole.entities.SamplingPoint.list('id', 2000);
    deleted.samplingPoints = await deleteInBatches(
      base44.asServiceRole.entities.SamplingPoint,
      samplingPoints.map(p => p.id)
    );
    await delay(500);

    // Удалить EquipmentUnits
    const equipmentUnits = await base44.asServiceRole.entities.EquipmentUnit.list('id', 2000);
    deleted.equipmentUnits = await deleteInBatches(
      base44.asServiceRole.entities.EquipmentUnit,
      equipmentUnits.map(u => u.id)
    );
    await delay(500);

    // Удалить Assets
    const assets = await base44.asServiceRole.entities.Asset.list('id', 2000);
    deleted.assets = await deleteInBatches(
      base44.asServiceRole.entities.Asset,
      assets.map(a => a.id)
    );

    return Response.json({
      success: true,
      message: 'Test data deleted successfully',
      deleted
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});