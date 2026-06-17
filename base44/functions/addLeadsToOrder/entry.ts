import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { order_id, count, allowed_states = [], age_min = 1, age_max = 3, dry_run = true, lead_type: overrideType } = await req.json();

    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const snapshot = order.lead_data_snapshot || [];
    const leadType = (overrideType || snapshot[0]?.lead_type || 'final_expense').toLowerCase().replace(/_/g, ' ');
    const existingIds = new Set(order.leads_purchased || []);

    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Fetch from aged_leads table in Supabase, paginating like getFilteredLeads
    const PAGE_SIZE = 1000;
    let allLeads = [];
    let offset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.append('select', '*');
      params.append('lead_type', `ilike.${leadType}`);
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

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase error: ${res.status} ${text}`);
      }

      const page = await res.json();
      allLeads = allLeads.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log(`Fetched ${allLeads.length} ${leadType} leads from aged_leads`);

    const getTier = (days) => {
      if (days <= 3) return 'tier1';
      if (days <= 14) return 'tier2';
      if (days <= 30) return 'tier3';
      if (days <= 90) return 'tier4';
      return 'tier5';
    };

    const candidates = allLeads.map((lead, index) => {
      // Calculate age_in_days from external_id (format: YYYYMMDD-...)
      let age_in_days = 0;
      if (lead.external_id) {
        const dateStr = String(lead.external_id).split('-')[0];
        if (dateStr.length === 8) {
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6)) - 1;
          const day = parseInt(dateStr.substring(6, 8));
          const uploadDate = new Date(year, month, day);
          if (!isNaN(uploadDate.getTime())) {
            age_in_days = Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
          }
        }
      }

      const leadId = lead.id || `${leadType}_${index}`;
      const available = !soldIds.has(leadId) && !soldIds.has(lead.external_id) && !existingIds.has(leadId) && !existingIds.has(lead.external_id);
      const ageOk = age_in_days >= age_min && age_in_days <= age_max;
      const stateOk = allowed_states.length === 0 || allowed_states.includes(lead.state);

      return { ...lead, _id: leadId, age_in_days, _available: available && ageOk && stateOk };
    }).filter(l => l._available);

    console.log(`Found ${candidates.length} candidates (age ${age_min}-${age_max}, states: ${allowed_states.join(',') || 'all'})`);

    const needed = count || candidates.length;
    if (candidates.length < needed) {
      return Response.json({
        error: `Not enough leads. Need ${needed}, found ${candidates.length}`,
        available_preview: candidates.slice(0, 10).map(l => ({ id: l._id, external_id: l.external_id, state: l.state, age_in_days: l.age_in_days }))
      }, { status: 400 });
    }

    const additions = candidates.slice(0, needed);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        found: candidates.length,
        would_add: additions.map(l => ({ id: l._id, external_id: l.external_id, name: l.first_name, state: l.state, age_in_days: l.age_in_days }))
      });
    }

    // Build new lists
    const newLeadIds = [...(order.leads_purchased || []), ...additions.map(l => l._id)];
    const newSnapshot = [...snapshot];
    for (const lead of additions) {
      const snap = { ...lead };
      delete snap._available;
      snap.lead_id = lead._id;
      newSnapshot.push(snap);
    }

    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newLeadIds.length
    });

    for (const lead of additions) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead._id,
        tier: getTier(lead.age_in_days || 1),
        order_id,
        sale_date: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      added_count: additions.length,
      added_leads: additions.map(l => ({ id: l._id, external_id: l.external_id, name: l.first_name, state: l.state, age_in_days: l.age_in_days })),
      total_leads: newLeadIds.length
    });

  } catch (error) {
    console.error('addLeadsToOrder error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});