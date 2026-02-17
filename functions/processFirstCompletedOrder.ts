import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all completed orders
    const completedOrders = await base44.asServiceRole.entities.Order.filter({ status: 'completed' }, 'created_date', 1000);

    if (!completedOrders.length) {
      return Response.json({ message: 'No completed orders found.' });
    }

    console.log(`Processing ${completedOrders.length} completed orders...`);

    const results = [];
    for (const order of completedOrders) {
      try {
        console.log(`Syncing order ${order.id} for ${order.customer_email}`);
        const hubspotResponse = await base44.asServiceRole.functions.invoke('syncOrderToHubspot', {
          orderData: order
        });
        results.push({ orderId: order.id, status: 'success', hubspotResult: hubspotResponse.data });
      } catch (err) {
        console.error(`Failed to sync order ${order.id}:`, err.message);
        results.push({ orderId: order.id, status: 'failed', error: err.message });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return Response.json({
      message: `Processed ${completedOrders.length} orders: ${succeeded} succeeded, ${failed} failed.`,
      results
    });

  } catch (error) {
    console.error('Error processing orders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});