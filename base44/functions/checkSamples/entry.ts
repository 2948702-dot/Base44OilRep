import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const samples = await base44.entities.OilSample.list('-updated_date', 10);
    
    return Response.json({
      total: samples.length || 0,
      samples: samples.map(s => ({
        id: s.id,
        number: s.sample_number,
        type: s.sample_type,
        date: s.sampling_date,
        client: s.client_id,
        asset: s.asset_id
      }))
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});