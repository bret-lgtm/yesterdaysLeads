import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { customer_id } = await req.json();

    // Get all orders for this customer - fetch minimal fields by listing and filtering
    const allOrders = await base44.asServiceRole.entities.Order.filter({ customer_id });
    console.log(`Found ${allOrders.length} orders`);

    // Sort by date ascending (oldest first)
    allOrders.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    // Build email -> first occurrence map (scan snapshots in memory)
    const emailSeen = {}; // email -> { order_id, lead_id, name }
    const phoneSeen = {}; // phone -> { order_id, lead_id, name }
    
    // duplicates[order_id] = list of {lead_id, name, reason, first_order_id}
    const duplicates = {};

    for (const order of allOrders) {
      const snapshot = order.lead_data_snapshot || [];
      duplicates[order.id] = [];

      for (const lead of snapshot) {
        const leadId = lead.lead_id || lead.id;
        const name = `${lead.first_name} ${lead.last_name}`;
        let isDup = false;
        let reason = '';
        let firstOrderId = '';

        // Check email
        if (lead.email && lead.email.trim()) {
          const email = lead.email.trim().toLowerCase();
          if (emailSeen[email] && emailSeen[email].order_id !== order.id) {
            isDup = true;
            reason = `email:${email}`;
            firstOrderId = emailSeen[email].order_id;
          }
        }

        // Check phone
        if (!isDup && lead.phone && lead.phone.trim()) {
          const phone = lead.phone.trim().replace(/\D/g, '').slice(-10);
          if (phone.length === 10 && phoneSeen[phone] && phoneSeen[phone].order_id !== order.id) {
            isDup = true;
            reason = `phone:${phone}`;
            firstOrderId = phoneSeen[phone].order_id;
          }
        }

        if (isDup) {
          duplicates[order.id].push({ lead_id: leadId, name, reason, first_order_id: firstOrderId, state: lead.state, lead_type: lead.lead_type });
        } else {
          // Mark as seen (only if not already a dup)
          if (lead.email && lead.email.trim()) {
            const email = lead.email.trim().toLowerCase();
            if (!emailSeen[email]) emailSeen[email] = { order_id: order.id, lead_id: leadId };
          }
          if (lead.phone && lead.phone.trim()) {
            const phone = lead.phone.trim().replace(/\D/g, '').slice(-10);
            if (phone.length === 10 && !phoneSeen[phone]) phoneSeen[phone] = { order_id: order.id, lead_id: leadId };
          }
        }
      }
    }

    const summary = allOrders.map(o => ({
      order_id: o.id,
      order_date: o.created_date,
      total_price: o.total_price,
      lead_count: (o.lead_data_snapshot || []).length || (o.leads_purchased || []).length,
      duplicate_count: duplicates[o.id]?.length || 0,
      duplicates: duplicates[o.id] || []
    }));

    const totalDups = summary.reduce((s, o) => s + o.duplicate_count, 0);
    console.log(`Total cross-order duplicates: ${totalDups}`);

    return Response.json({ total_orders: allOrders.length, total_cross_order_duplicates: totalDups, orders: summary });

  } catch (error) {
    console.error('error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});