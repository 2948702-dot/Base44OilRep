import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const units = await base44.entities.EquipmentUnit.list();
    const seen = new Map();
    const toDelete = [];

    for (const unit of units) {
      const key = `${unit.asset_id}_${unit.unit_name}`.toLowerCase();
      
      if (seen.has(key)) {
        toDelete.push(unit.id);
      } else {
        seen.set(key, unit.id);
      }
    }

    for (const id of toDelete) {
      await base44.entities.EquipmentUnit.delete(id);
    }

    return Response.json({ 
      message: `Удалено ${toDelete.length} дубликатов из ${units.length} узлов оборудования`,
      deleted: toDelete.length,
      total: units.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});