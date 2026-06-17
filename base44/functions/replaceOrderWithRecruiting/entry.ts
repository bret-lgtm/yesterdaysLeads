import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { order_id, needed_count = 13, dry_run = true } = await req.json();
    if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const oldLeadIds = order.leads_purchased || [];

    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const globalSoldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Fetch recruiting leads from aged_leads in Supabase
    const PAGE_SIZE = 1000;
    let allLeads = [];
    let offset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.append('select', '*');
      params.append('lead_type', 'ilike.Recruiting');
      params.append('limit', String(PAGE_SIZE));
      params.append('offset', String(offset));

      const res = await fetch(`${SUPABASE_URL}/rest/v1/aged_leads?${params.toString()}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        }
      });
      if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
      const page = await res.json();
      allLeads = allLeads.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const getTier = (days) => {
      if (days <= 3) return 'tier1';
      if (days <= 14) return 'tier2';
      if (days <= 30) return 'tier3';
      if (days <= 90) return 'tier4';
      return 'tier5';
    };

    const candidates = [];
    for (const lead of allLeads) {
      let age_in_days = 0;
      if (lead.external_id) {
        const dateStr = String(lead.external_id).split('-')[0];
        if (dateStr.length === 8) {
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6)) - 1;
          const day = parseInt(dateStr.substring(6, 8));
          const uploadDate = new Date(year, month, day);
          if (!isNaN(uploadDate.getTime())) {
            age_in_days = Math.floor((Date.now() - uploadDate) / (1000 * 60 * 60 * 24));
          }
        }
      }

      const isAvailable = !globalSoldIds.has(lead.id) && !globalSoldIds.has(lead.external_id);
      const state = String(lead.state || '').trim().toUpperCase();
      const notAlaska = state !== 'AK' && state !== 'ALASKA';

      if (isAvailable && notAlaska && lead.first_name) {
        candidates.push({ ...lead, age_in_days });
      }
    }

    if (candidates.length < needed_count) {
      return Response.json({
        error: `Not enough recruiting leads. Need ${needed_count}, found ${candidates.length}`
      }, { status: 400 });
    }

    const selected = candidates.slice(0, needed_count);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        removing_count: oldLeadIds.length,
        adding_count: selected.length,
        would_add: selected.map(l => ({ id: l.id, name: l.first_name, state: l.state, external_id: l.external_id }))
      });
    }

    // Delete old suppression records
    const oldSuppressionRecords = suppressionRecords.filter(r => oldLeadIds.includes(r.lead_id));
    for (const rec of oldSuppressionRecords) {
      await base44.asServiceRole.entities.LeadSuppression.delete(rec.id);
    }

    const newSnapshot = selected.map(l => {
      const { lead_id, ...rest } = l;
      return { ...rest, lead_id: l.id };
    });
    const newLeadIds = selected.map(l => l.id);

    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newLeadIds.length
    });

    for (const lead of selected) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.id,
        tier: getTier(lead.age_in_days || 0),
        order_id,
        sale_date: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      removed_count: oldLeadIds.length,
      added_count: selected.length,
      new_leads: selected.map(l => ({ id: l.id, name: l.first_name, state: l.state, external_id: l.external_id }))
    });
  } catch (error) {
    console.error('replaceOrderWithRecruiting error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});