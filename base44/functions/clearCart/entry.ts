import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all cart items for this user
    const items = await base44.asServiceRole.entities.CartItem.filter({ user_email: user.email });

    // Delete in parallel batches of 20 to avoid overwhelming the API
    const BATCH_SIZE = 20;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(item => base44.asServiceRole.entities.CartItem.delete(item.id)));
    }

    return Response.json({ success: true, deleted: items.length });
  } catch (error) {
    console.error('Error clearing cart:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});