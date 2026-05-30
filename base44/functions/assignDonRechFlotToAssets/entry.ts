import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Получить всех клиентов и найти "ДонРечФлот"
    const allClients = await base44.asServiceRole.entities.Client.list();
    const donRechFlot = allClients.find(c => c.company_name && c.company_name.includes('ДонРечФлот'));
    
    if (!donRechFlot) {
      return Response.json({ error: 'ДонРечФлот client not found in database' }, { status: 404 });
    }

    // Получить все суда и найти без клиента
    const allAssets = await base44.asServiceRole.entities.Asset.list();
    const assetsWithoutClient = allAssets.filter(a => !a.client_id || String(a.client_id).trim() === '');

    if (assetsWithoutClient.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'No assets without client found',
        updatedCount: 0,
        clientFound: donRechFlot.id
      });
    }

    // Обновить все суда
    let updated = 0;
    let errors = [];
    
    for (const asset of assetsWithoutClient) {
      try {
        await base44.asServiceRole.entities.Asset.update(asset.id, { client_id: donRechFlot.id });
        updated++;
      } catch (err) {
        errors.push({ assetId: asset.id, name: asset.asset_name, error: err.message });
      }
    }

    return Response.json({
      success: true,
      message: `Assigned ДонРечФлот to assets without client`,
      foundWithoutClient: assetsWithoutClient.length,
      updatedCount: updated,
      errors: errors.length > 0 ? errors : null,
      donRechFlotId: donRechFlot.id,
      assetsList: assetsWithoutClient.map(a => ({ id: a.id, name: a.asset_name }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});