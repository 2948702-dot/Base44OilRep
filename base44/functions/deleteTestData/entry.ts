import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const deleted = {
      assets: 0,
      equipmentUnits: 0,
      samplingPoints: 0,
      oilSamples: 0
    };

    // Удалить Oil Samples
    const oilSamples = await base44.asServiceRole.entities.OilSample.list();
    for (const sample of oilSamples) {
      try {
        await base44.asServiceRole.entities.OilSample.delete(sample.id);
        deleted.oilSamples++;
      } catch (err) {
        console.error(`Failed to delete oil sample ${sample.id}:`, err.message);
      }
    }

    // Удалить Sampling Points
    const samplingPoints = await base44.asServiceRole.entities.SamplingPoint.list();
    for (const point of samplingPoints) {
      try {
        await base44.asServiceRole.entities.SamplingPoint.delete(point.id);
        deleted.samplingPoints++;
      } catch (err) {
        console.error(`Failed to delete sampling point ${point.id}:`, err.message);
      }
    }

    // Удалить Equipment Units
    const equipmentUnits = await base44.asServiceRole.entities.EquipmentUnit.list();
    for (const unit of equipmentUnits) {
      try {
        await base44.asServiceRole.entities.EquipmentUnit.delete(unit.id);
        deleted.equipmentUnits++;
      } catch (err) {
        console.error(`Failed to delete equipment unit ${unit.id}:`, err.message);
      }
    }

    // Удалить Assets
    const assets = await base44.asServiceRole.entities.Asset.list();
    for (const asset of assets) {
      try {
        await base44.asServiceRole.entities.Asset.delete(asset.id);
        deleted.assets++;
      } catch (err) {
        console.error(`Failed to delete asset ${asset.id}:`, err.message);
      }
    }

    return Response.json({
      success: true,
      message: 'Test data deleted successfully',
      deleted
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});