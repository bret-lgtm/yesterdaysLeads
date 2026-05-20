import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { customer_email } = await req.json();
    if (!customer_email) {
      return Response.json({ error: 'customer_email required' }, { status: 400 });
    }

    // Get all completed orders for this customer
    const orders = await base44.asServiceRole.entities.Order.filter({
      customer_email,
      status: 'completed'
    });

    console.log(`Found ${orders.length} completed orders for ${customer_email}`);

    // Collect all unique lead IDs across all orders
    const allLeadIds = new Set();
    for (const order of orders) {
      const leads = order.leads_purchased || [];
      leads.forEach(id => allLeadIds.add(id));
    }

    const suppressionList = Array.from(allLeadIds);
    console.log(`Total unique lead IDs: ${suppressionList.length}`);

    // Find the customer record
    const customers = await base44.asServiceRole.entities.Customer.filter({ email: customer_email });
    if (!customers.length) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }

    const customer = customers[0];
    const previousCount = (customer.suppression_list || []).length;

    // Update the suppression list
    await base44.asServiceRole.entities.Customer.update(customer.id, {
      suppression_list: suppressionList
    });

    return Response.json({
      success: true,
      customer_email,
      orders_found: orders.length,
      order_ids: orders.map(o => ({ id: o.id, lead_count: (o.leads_purchased || []).length, status: o.status, date: o.created_date })),
      previous_suppression_count: previousCount,
      new_suppression_count: suppressionList.length
    });

  } catch (error) {
    console.error('Error rebuilding suppression list:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});