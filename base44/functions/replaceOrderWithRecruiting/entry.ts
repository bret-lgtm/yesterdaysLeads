import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { order_id, needed_count = 13, dry_run = true } = await req.json();
    if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

    // Load the order
    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const oldLeadIds = order.leads_purchased || [];
    console.log(`Order ${order_id}: removing ${oldLeadIds.length} leads, replacing with ${needed_count} recruiting leads`);

    // Get global suppression list so we don't re-sell already-sold recruiting leads
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const globalSoldIds = new Set(suppressionRecords.map(r => r.lead_id));
    console.log(`Global suppression size: ${globalSoldIds.size}`);

    // Fetch recruiting sheet
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    if (!apiKey || !spreadsheetId) return Response.json({ error: 'Missing Google API config' }, { status: 500 });

    const range = `'Recruiting Leads'!A1:Z5000`;
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&key=${apiKey}`
    );
    if (!sheetRes.ok) {
      const text = await sheetRes.text();
      return Response.json({ error: `Sheet fetch failed: ${text}` }, { status: 500 });
    }

    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    if (rows.length < 2) return Response.json({ error: 'No data in Recruiting sheet' }, { status: 400 });

    const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
    const dataRows = rows.slice(1);

    const getTier = (days) => {
      if (days <= 3) return 'tier1';
      if (days <= 14) return 'tier2';
      if (days <= 30) return 'tier3';
      if (days <= 90) return 'tier4';
      return 'tier5';
    };

    // Parse and filter candidates
    const candidates = [];
    dataRows.forEach((row, index) => {
      const lead = {};
      headers.forEach((h, i) => { lead[h] = row[i] !== undefined ? row[i] : ''; });
      lead.lead_id = `recruiting_${index}`;
      lead.lead_type = 'recruiting';

      if (lead.external_id) {
        const dateStr = String(lead.external_id).split('-')[0];
        if (dateStr.length === 8) {
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6)) - 1;
          const day = parseInt(dateStr.substring(6, 8));
          const uploadDate = new Date(year, month, day);
          if (!isNaN(uploadDate.getTime())) {
            lead.age_in_days = Math.floor((Date.now() - uploadDate) / (1000 * 60 * 60 * 24));
          }
        }
      }

      const statusVal = String(lead.status || '').trim().toLowerCase();
      const isAvailable = !globalSoldIds.has(lead.lead_id) &&
        (!statusVal || statusVal === 'available' || statusVal === 'undefined');

      const state = String(lead.state || '').trim().toUpperCase();
      const notAlaska = state !== 'AK' && state !== 'ALASKA';

      if (isAvailable && notAlaska && lead.first_name) {
        candidates.push(lead);
      }
    });

    console.log(`Available recruiting candidates (no AK): ${candidates.length}`);

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
        removing_ids: oldLeadIds,
        adding_count: selected.length,
        would_add: selected.map(l => ({ id: l.lead_id, name: l.first_name, state: l.state, external_id: l.external_id }))
      });
    }

    // --- Live run ---

    // 1. Delete old suppression records for the leads being removed
    const oldSuppressionRecords = suppressionRecords.filter(r => oldLeadIds.includes(r.lead_id));
    console.log(`Deleting ${oldSuppressionRecords.length} old suppression records`);
    for (const rec of oldSuppressionRecords) {
      await base44.asServiceRole.entities.LeadSuppression.delete(rec.id);
    }

    // 2. Build new snapshot
    const newSnapshot = selected.map(l => {
      const snap = { ...l };
      delete snap.lead_id; // will be stored in leads_purchased array
      delete snap.status;
      return snap;
    });

    const newLeadIds = selected.map(l => l.lead_id);

    // 3. Update the order
    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newLeadIds.length
    });
    console.log(`Order updated: ${newLeadIds.length} recruiting leads`);

    // 4. Create new suppression records
    for (const lead of selected) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.lead_id,
        tier: getTier(lead.age_in_days || 0),
        order_id: order_id,
        sale_date: new Date().toISOString()
      });
    }
    console.log(`Created ${selected.length} new suppression records`);

    return Response.json({
      success: true,
      removed_count: oldLeadIds.length,
      added_count: selected.length,
      new_leads: selected.map(l => ({ id: l.lead_id, name: l.first_name, state: l.state, external_id: l.external_id }))
    });

  } catch (error) {
    console.error('replaceOrderWithRecruiting error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});