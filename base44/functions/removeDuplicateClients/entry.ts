import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const clients = await base44.entities.Client.list();
    const seen = new Map();
    const toDelete = [];

    for (const client of clients) {
      const key = client.company_name.toLowerCase();
      
      if (seen.has(key)) {
        toDelete.push(client.id);
      } else {
        seen.set(key, client.id);
      }
    }

    for (const id of toDelete) {
      await base44.entities.Client.delete(id);
    }

    return Response.json({ 
      message: `Удалено ${toDelete.length} дубликатов из ${clients.length} клиентов`,
      deleted: toDelete.length,
      total: clients.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});