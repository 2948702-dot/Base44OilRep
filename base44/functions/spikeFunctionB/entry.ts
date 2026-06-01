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
    const user = await base44.auth.me().catch(() => null);

    return Response.json({
      caller: 'spikeFunctionB',
      user: safeUser(user),
    }, { status: 200 });
  } catch (error) {
    return Response.json({
      caller: 'spikeFunctionB',
      error: error.message,
    }, { status: 500 });
  }
});
