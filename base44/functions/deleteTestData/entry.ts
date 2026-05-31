import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function deleteChunk(entity, limit = 50) {
  const items = await entity.list('id', limit);
  let deleted = 0;
  for (const item of items) {
    try {
      await entity.delete(item.id);
      deleted++;
    } catch (e) {
      // rate limit — skip, will delete on next run
    }
    await delay(300);
  }
  return { deleted, remaining: items.length - deleted };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const e = base44.asServiceRole.entities;

    // Удаляем по 50 записей каждого типа за один запуск
    const analysisResults  = await deleteChunk(e.AnalysisResult, 50);
    const maintenanceEvents = await deleteChunk(e.MaintenanceEvent, 50);
    const oilLifecycles     = await deleteChunk(e.OilLifecycle, 50);
    const oilSamples        = await deleteChunk(e.OilSample, 50);
    const samplingPoints    = await deleteChunk(e.SamplingPoint, 50);
    const equipmentUnits    = await deleteChunk(e.EquipmentUnit, 50);
    const assets            = await deleteChunk(e.Asset, 50);

    const totalRemaining =
      analysisResults.remaining + maintenanceEvents.remaining + oilLifecycles.remaining +
      oilSamples.remaining + samplingPoints.remaining + equipmentUnits.remaining + assets.remaining;

    // Проверяем полный остаток в базе
    const [arLeft, meLeft, olLeft, osLeft, spLeft, euLeft, asLeft] = await Promise.all([
      e.AnalysisResult.list('id', 1),
      e.MaintenanceEvent.list('id', 1),
      e.OilLifecycle.list('id', 1),
      e.OilSample.list('id', 1),
      e.SamplingPoint.list('id', 1),
      e.EquipmentUnit.list('id', 1),
      e.Asset.list('id', 1),
    ]);

    const doneCompletely =
      !arLeft.length && !meLeft.length && !olLeft.length &&
      !osLeft.length && !spLeft.length && !euLeft.length && !asLeft.length;

    return Response.json({
      success: true,
      message: doneCompletely
        ? '✅ Все данные удалены!'
        : '⚠️ Запустите функцию ещё раз — остались записи',
      deleted: {
        analysisResults: analysisResults.deleted,
        maintenanceEvents: maintenanceEvents.deleted,
        oilLifecycles: oilLifecycles.deleted,
        oilSamples: oilSamples.deleted,
        samplingPoints: samplingPoints.deleted,
        equipmentUnits: equipmentUnits.deleted,
        assets: assets.deleted,
      },
      stillRemaining: {
        analysisResults: arLeft.length ? 'есть' : '0',
        maintenanceEvents: meLeft.length ? 'есть' : '0',
        oilLifecycles: olLeft.length ? 'есть' : '0',
        oilSamples: osLeft.length ? 'есть' : '0',
        samplingPoints: spLeft.length ? 'есть' : '0',
        equipmentUnits: euLeft.length ? 'есть' : '0',
        assets: asLeft.length ? 'есть' : '0',
      },
      doneCompletely,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});