import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { order_id, allowed_states, dry_run = false } = await req.json();
    if (!order_id || !allowed_states?.length) {
      return Response.json({ error: 'order_id and allowed_states required' }, { status: 400 });
    }

    const order = await base44.asServiceRole.entities.Order.get(order_id);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

    const snapshot = order.lead_data_snapshot || [];
    const allowedSet = new Set(allowed_states.map(s => s.toUpperCase()));

    const goodLeads = snapshot.filter(l => allowedSet.has((l.state || '').toUpperCase()));
    const badLeads = snapshot.filter(l => !allowedSet.has((l.state || '').toUpperCase()));
    const neededCount = badLeads.length;

    if (neededCount === 0) {
      return Response.json({ message: 'No out-of-state leads found.', bad_leads: [] });
    }

    if (dry_run) {
      return Response.json({
        dry_run: true,
        bad_lead_count: badLeads.length,
        bad_leads: badLeads.map(l => ({ lead_id: l.lead_id, name: l.first_name, state: l.state }))
      });
    }

    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));
    snapshot.forEach(l => soldLeadIds.add(l.lead_id));
    badLeads.forEach(l => soldLeadIds.delete(l.lead_id));

    const leadType = snapshot[0]?.lead_type || 'final_expense';

    // Fetch from aged_leads in Supabase
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
      if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
      const page = await res.json();
      allLeads = allLeads.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Parse and filter
    const allParsed = allLeads.map((lead) => {
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
      return { ...lead, age_in_days };
    });

    const replacements = allParsed.filter(lead => {
      if (soldLeadIds.has(lead.id)) return false;
      return allowedSet.has(String(lead.state || '').toUpperCase());
    });

    if (replacements.length < neededCount) {
      return Response.json({
        error: `Not enough replacements. Need ${neededCount}, found ${replacements.length}.`
      }, { status: 400 });
    }

    const chosen = replacements.slice(0, neededCount);

    const newSnapshot = [
      ...goodLeads,
      ...chosen.map(lead => ({ ...lead, lead_id: lead.id }))
    ];
    const newLeadIds = newSnapshot.map(l => l.lead_id || l.id);

    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newSnapshot.length
    });

    for (const badLead of badLeads) {
      const records = suppressionRecords.filter(r => r.lead_id === badLead.lead_id && r.order_id === order_id);
      for (const rec of records) {
        await base44.asServiceRole.entities.LeadSuppression.delete(rec.id);
      }
    }

    function getTierFromAge(age) {
      if (age >= 1 && age <= 3) return 'tier1';
      if (age >= 4 && age <= 14) return 'tier2';
      if (age >= 15 && age <= 30) return 'tier3';
      if (age >= 31 && age <= 90) return 'tier4';
      return 'tier5';
    }
    for (const lead of chosen) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.id,
        tier: getTierFromAge(lead.age_in_days || 1),
        order_id,
        sale_date: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      replaced_count: badLeads.length,
      removed_leads: badLeads.map(l => ({ lead_id: l.lead_id, name: l.first_name, state: l.state })),
      added_leads: chosen.map(l => ({ lead_id: l.id, name: l.first_name, state: l.state })),
      total_leads: newSnapshot.length
    });
  } catch (error) {
    console.error('replaceOutOfStateLeads error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});