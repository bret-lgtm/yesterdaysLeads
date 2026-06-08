import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { order_id } = await req.json();
    if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

    const order = await base44.asServiceRole.entities.Order.get(order_id);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

    const snapshot = order.lead_data_snapshot || [];

    const emailSeen = {};
    const phoneSeen = {};
    const duplicates = [];
    const unique = [];

    for (const lead of snapshot) {
      const leadId = lead.lead_id || lead.id || lead.external_id;
      const name = `${lead.first_name} ${lead.last_name}`;
      let isDup = false;
      let reason = '';

      if (lead.email && lead.email.trim()) {
        const email = lead.email.trim().toLowerCase();
        if (emailSeen[email]) {
          isDup = true;
          reason = `duplicate email: ${email} (first seen: ${emailSeen[email].name})`;
        } else {
          emailSeen[email] = { name, leadId };
        }
      }

      if (!isDup && lead.phone && String(lead.phone).trim()) {
        const phone = String(lead.phone).trim().replace(/\D/g, '').slice(-10);
        if (phone.length === 10 && phoneSeen[phone]) {
          isDup = true;
          reason = `duplicate phone: ${phone} (first seen: ${phoneSeen[phone].name})`;
        } else if (phone.length === 10) {
          phoneSeen[phone] = { name, leadId };
        }
      }

      if (isDup) {
        duplicates.push({ lead_id: leadId, name, reason, state: lead.state, lead_type: lead.lead_type });
      } else {
        unique.push(leadId);
      }
    }

    console.log(`Order ${order_id}: ${snapshot.length} total leads, ${duplicates.length} within-order duplicates`);

    return Response.json({
      order_id,
      total_leads: snapshot.length,
      duplicate_count: duplicates.length,
      duplicates
    });

  } catch (error) {
    console.error('error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});