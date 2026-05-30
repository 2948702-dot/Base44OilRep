import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const oils = await base44.entities.OilReference.list();
    const seen = new Map();
    const toDelete = [];

    for (const oil of oils) {
      const key = `${oil.oil_name}_${oil.manufacturer}`;
      
      if (seen.has(key)) {
        toDelete.push(oil.id);
      } else {
        seen.set(key, oil.id);
      }
    }

    for (const id of toDelete) {
      await base44.entities.OilReference.delete(id);
    }

    return Response.json({ 
      message: `Удалено ${toDelete.length} дубликатов из ${oils.length} записей`,
      deleted: toDelete.length,
      total: oils.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});