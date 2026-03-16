import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { customer_id } = await req.json();

    // Get all orders for this customer
    const orders = await base44.asServiceRole.entities.Order.filter({ customer_id });
    console.log(`Found ${orders.length} orders for customer`);

    // Build a map of email/phone -> [{order_id, lead_id, name}]
    const emailMap = {}; // email -> list of occurrences
    const phoneMap = {}; // phone -> list of occurrences

    for (const order of orders) {
      const snapshot = order.lead_data_snapshot || [];
      for (const lead of snapshot) {
        const leadId = lead.lead_id || lead.id;
        const entry = {
          order_id: order.id,
          order_date: order.created_date,
          lead_id: leadId,
          lead_type: lead.lead_type,
          name: `${lead.first_name} ${lead.last_name}`,
          state: lead.state
        };

        if (lead.email && lead.email.trim()) {
          const email = lead.email.trim().toLowerCase();
          if (!emailMap[email]) emailMap[email] = [];
          emailMap[email].push(entry);
        }

        if (lead.phone && lead.phone.trim()) {
          const phone = lead.phone.trim().replace(/\D/g, '');
          if (phone.length >= 10) {
            if (!phoneMap[phone]) phoneMap[phone] = [];
            phoneMap[phone].push(entry);
          }
        }
      }
    }

    // Find duplicates (more than 1 occurrence across different orders)
    const duplicatesByEmail = {};
    for (const [email, entries] of Object.entries(emailMap)) {
      const orderIds = new Set(entries.map(e => e.order_id));
      if (orderIds.size > 1) {
        duplicatesByEmail[email] = entries;
      }
    }

    const duplicatesByPhone = {};
    for (const [phone, entries] of Object.entries(phoneMap)) {
      const orderIds = new Set(entries.map(e => e.order_id));
      if (orderIds.size > 1) {
        // Only add if not already caught by email
        const emails = entries.map(e => {
          const snap = orders.find(o => o.id === e.order_id)?.lead_data_snapshot || [];
          const l = snap.find(l => (l.lead_id || l.id) === e.lead_id);
          return l?.email?.trim().toLowerCase() || '';
        });
        const alreadyCaught = emails.some(em => em && duplicatesByEmail[em]);
        if (!alreadyCaught) {
          duplicatesByPhone[phone] = entries;
        }
      }
    }

    // Summarize: per order, which lead_ids are duplicates (appear in another order)
    const duplicateLeadIdsByOrder = {};
    const allDuplicates = [...Object.values(duplicatesByEmail), ...Object.values(duplicatesByPhone)];

    for (const entries of allDuplicates) {
      // Sort by order date - keep the earliest, flag the rest as duplicates
      const sorted = [...entries].sort((a, b) => new Date(a.order_date) - new Date(b.order_date));
      const later = sorted.slice(1); // skip the first (original)
      for (const entry of later) {
        if (!duplicateLeadIdsByOrder[entry.order_id]) duplicateLeadIdsByOrder[entry.order_id] = [];
        duplicateLeadIdsByOrder[entry.order_id].push({
          lead_id: entry.lead_id,
          name: entry.name,
          duplicate_of_order: sorted[0].order_id,
          lead_type: entry.lead_type,
          state: entry.state
        });
      }
    }

    // Build summary
    const summary = orders.map(o => ({
      order_id: o.id,
      order_date: o.created_date,
      total_price: o.total_price,
      lead_count: o.lead_data_snapshot?.length || o.leads_purchased?.length || 0,
      cross_order_duplicates: duplicateLeadIdsByOrder[o.id] || [],
      duplicate_count: (duplicateLeadIdsByOrder[o.id] || []).length
    })).sort((a, b) => new Date(a.order_date) - new Date(b.order_date));

    const totalDuplicates = Object.values(duplicateLeadIdsByOrder).reduce((s, a) => s + a.length, 0);

    console.log(`Total cross-order duplicate leads found: ${totalDuplicates}`);

    return Response.json({
      customer_id,
      total_orders: orders.length,
      total_cross_order_duplicates: totalDuplicates,
      orders: summary,
      email_duplicates: duplicatesByEmail,
      phone_duplicates: duplicatesByPhone
    });

  } catch (error) {
    console.error('scanCrossOrderDuplicates error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});