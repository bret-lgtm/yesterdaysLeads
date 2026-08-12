import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user?.email) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { order_id } = await req.json();

    if (!order_id) {
      return Response.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Fetch the order using service role so we can inspect and delete it
    const order = await base44.asServiceRole.entities.Order.get(order_id);

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Only the order owner can cancel their own pending order
    if (order.customer_email !== user.email) {
      return Response.json({ error: 'You can only cancel your own orders' }, { status: 403 });
    }

    // Only pending orders can be cancelled — completed orders have already been charged
    if (order.status !== 'pending') {
      return Response.json({ error: 'Only pending orders can be cancelled' }, { status: 400 });
    }

    await base44.asServiceRole.entities.Order.delete(order_id);
    console.log(`Pending order ${order_id} cancelled by ${user.email}`);

    return Response.json({ success: true, order_id });
  } catch (error) {
    console.error('Error cancelling pending order:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});