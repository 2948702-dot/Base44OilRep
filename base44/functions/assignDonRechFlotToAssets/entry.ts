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
      return Response.json({ error: 'ДонРечФлот client not found' }, { status: 404 });
    }

    // Получить все суда с пустым client_id
    const assetsWithoutClient = await base44.asServiceRole.entities.Asset.filter({ client_id: null });
    const assetsWithEmptyString = await base44.asServiceRole.entities.Asset.filter({ client_id: '' });
    
    const combined = [...assetsWithoutClient, ...assetsWithEmptyString];
    const uniqueAssets = Array.from(new Map(combined.map(a => [a.id, a])).values());

    if (uniqueAssets.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'No assets without client found',
        updatedCount: 0
      });
    }

    // Обновить все суда
    let updated = 0;
    const assetsList = [];
    
    for (const asset of uniqueAssets) {
      try {
        await base44.asServiceRole.entities.Asset.update(asset.id, { client_id: donRechFlot.id });
        updated++;
        assetsList.push({ id: asset.id, name: asset.asset_name });
      } catch (err) {
        console.error(`Failed to update ${asset.id}:`, err.message);
      }
    }

    return Response.json({
      success: true,
      message: `Assigned ДонРечФлот to ${updated} assets`,
      updatedCount: updated,
      assetsList: assetsList
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});