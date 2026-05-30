import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Найти клиента "ДонРечФлот"
    const clients = await base44.entities.Client.filter({ company_name: 'ДонРечФлот' });
    if (!clients || clients.length === 0) {
      return Response.json({ error: 'ДонРечФлот client not found' }, { status: 404 });
    }
    const donRechFlotId = clients[0].id;

    // Найти все суда без клиента (пустой или null client_id)
    const allAssets = await base44.entities.Asset.list();
    const assetsWithoutClient = allAssets.filter(a => !a.client_id);

    if (assetsWithoutClient.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'No assets without client found',
        updatedCount: 0 
      });
    }

    // Обновить все суда
    let updated = 0;
    for (const asset of assetsWithoutClient) {
      try {
        await base44.entities.Asset.update(asset.id, { client_id: donRechFlotId });
        updated++;
      } catch (err) {
        console.error(`Failed to update asset ${asset.id}:`, err.message);
      }
    }

    return Response.json({
      success: true,
      message: `Assigned ДонРечФлот to assets without client`,
      totalWithoutClient: assetsWithoutClient.length,
      updatedCount: updated,
      donRechFlotId
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});