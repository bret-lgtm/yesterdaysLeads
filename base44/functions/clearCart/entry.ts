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

    // Delete sequentially to avoid rate limiting
    let deleted = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await base44.asServiceRole.entities.CartItem.delete(item.id);
        deleted++;
      } catch (err) {
        failed++;
        console.error(`Failed to delete cart item ${item.id}:`, err.message);
      }
      // Small delay between deletes to stay under rate limits
      if (deleted % 5 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return Response.json({ success: true, deleted, failed });
  } catch (error) {
    console.error('Error clearing cart:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});