import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id || null,
    email: user.email || null,
    role: user.role || null,
    client_id: user.client_id || null,
    asset_id: user.asset_id || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const callerUserA = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === 'service' ? 'service' : 'user';

    let responseB;
    if (mode === 'service') {
      responseB = await base44.asServiceRole.functions.invoke('spikeFunctionB', {});
    } else {
      responseB = await base44.functions.invoke('spikeFunctionB', {});
    }

    return Response.json({
      caller: 'spikeFunctionA',
      mode,
      callerUserA: safeUser(callerUserA),
      responseB: {
        status: responseB.status,
        data: responseB.data,
      },
    }, { status: 200 });
  } catch (error) {
    return Response.json({
      caller: 'spikeFunctionA',
      error: error.message,
    }, { status: 500 });
  }
});
