import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { order_id, duplicate_leads, dry_run = true } = await req.json();
    if (!order_id || !duplicate_leads?.length) {
      return Response.json({ error: 'order_id and duplicate_leads required' }, { status: 400 });
    }

    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const duplicateIds = new Set(duplicate_leads.map(d => d.lead_id));
    const snapshot = order.lead_data_snapshot || [];
    const leadType = snapshot[0]?.lead_type || 'final_expense';

    // Build age map for duplicates
    const dupAgeMap = {};
    for (const s of snapshot) {
      const id = s.lead_id || s.id;
      if (duplicateIds.has(id)) dupAgeMap[id] = s.age_in_days || 0;
    }
    for (const d of duplicate_leads) {
      if (d.age_in_days != null) dupAgeMap[d.lead_id] = d.age_in_days;
    }

    // Group needed by state
    const neededByState = {};
    for (const d of duplicate_leads) {
      neededByState[d.state] = (neededByState[d.state] || 0) + 1;
    }

    // Get suppression list
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Exclude all of this customer's leads
    const allCustomerOrders = await base44.asServiceRole.entities.Order.filter({ customer_id: order.customer_id });
    const allCustomerLeadIds = new Set();
    for (const o of allCustomerOrders) {
      for (const lid of (o.leads_purchased || [])) {
        if (!duplicateIds.has(lid)) allCustomerLeadIds.add(lid);
      }
    }

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

    const getTier = (days) => {
      if (days <= 3) return 'tier1';
      if (days <= 14) return 'tier2';
      if (days <= 30) return 'tier3';
      if (days <= 90) return 'tier4';
      return 'tier5';
    };

    // Parse candidates
    const candidates = allLeads.map((lead, index) => {
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
      lead.age_in_days = age_in_days;
      lead._id = lead.id;
      lead._available = !soldIds.has(lead.id) && !soldIds.has(lead.external_id) && !allCustomerLeadIds.has(lead.id) && !duplicateIds.has(lead.id);
      return lead;
    }).filter(l => l._available);

    // Group by state
    const candidatesByState = {};
    for (const c of candidates) {
      if (!candidatesByState[c.state]) candidatesByState[c.state] = [];
      candidatesByState[c.state].push(c);
    }

    const usedCandidateIds = new Set();
    const replacements = [];
    const errors = [];

    for (const dup of duplicate_leads) {
      const dupAge = dupAgeMap[dup.lead_id] || 0;
      const dupTier = getTier(dupAge);
      const pool = (candidatesByState[dup.state] || []).filter(c => {
        if (usedCandidateIds.has(c._id)) return false;
        return getTier(c.age_in_days || 0) === dupTier;
      });

      if (pool.length === 0) {
        const fallback = (candidatesByState[dup.state] || []).find(c => !usedCandidateIds.has(c._id));
        if (!fallback) {
          errors.push(`No replacement found for ${dup.lead_id} (state:${dup.state}, tier:${dupTier})`);
          continue;
        }
        usedCandidateIds.add(fallback._id);
        replacements.push({ ...fallback, _replacing: dup.lead_id });
      } else {
        usedCandidateIds.add(pool[0]._id);
        replacements.push({ ...pool[0], _replacing: dup.lead_id });
      }
    }

    if (errors.length) {
      return Response.json({ error: errors.join('; ') }, { status: 400 });
    }

    if (dry_run) {
      return Response.json({
        dry_run: true,
        removing: duplicate_leads,
        adding: replacements.map(l => ({ id: l._id, name: l.first_name, state: l.state, age_in_days: l.age_in_days })),
        total_replacing: replacements.length
      });
    }

    const newLeadIds = (order.leads_purchased || []).filter(id => !duplicateIds.has(id));
    const newSnapshot = snapshot.filter(s => !duplicateIds.has(s.lead_id || s.id));

    for (const lead of replacements) {
      const snap = { ...lead };
      delete snap._available;
      delete snap._id;
      snap.lead_id = lead._id;
      newLeadIds.push(lead._id);
      newSnapshot.push(snap);
    }

    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newLeadIds.length
    });

    for (const dup of duplicate_leads) {
      const existing = await base44.asServiceRole.entities.LeadSuppression.filter({ lead_id: dup.lead_id, order_id });
      for (const rec of existing) {
        await base44.asServiceRole.entities.LeadSuppression.delete(rec.id);
      }
    }

    for (const lead of replacements) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead._id,
        tier: getTier(lead.age_in_days || 0),
        order_id,
        sale_date: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      replaced_count: duplicate_leads.length,
      new_leads: replacements.map(l => ({ id: l._id, name: l.first_name, state: l.state })),
      total_leads: newLeadIds.length
    });
  } catch (error) {
    console.error('replaceCrossOrderDuplicates error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});