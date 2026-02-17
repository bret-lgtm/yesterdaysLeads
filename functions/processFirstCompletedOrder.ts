import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Find the first completed order
    const completedOrders = await base44.asServiceRole.entities.Order.filter({ status: 'completed' }, null, 1);
    const firstOrder = completedOrders[0];

    if (!firstOrder) {
      return Response.json({ message: 'No completed orders found to process.' });
    }

    console.log(`Processing order: ${firstOrder.id}`);

    // Invoke the HubSpot sync function
    const hubspotResponse = await base44.asServiceRole.functions.invoke('syncOrderToHubspot', {
      orderData: firstOrder
    });

    console.log('HubSpot sync response:', hubspotResponse.data);

    return Response.json({
      message: 'Successfully processed the first completed order for HubSpot sync.',
      orderId: firstOrder.id,
      hubspotResult: hubspotResponse.data
    });

  } catch (error) {
    console.error('Error processing first completed order:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});