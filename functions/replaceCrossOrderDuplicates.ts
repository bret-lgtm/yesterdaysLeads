import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // duplicate_leads: array of { lead_id, state } to replace
    const { order_id, duplicate_leads, dry_run = true } = await req.json();

    if (!order_id || !duplicate_leads?.length) {
      return Response.json({ error: 'order_id and duplicate_leads required' }, { status: 400 });
    }

    // Load order
    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const duplicateIds = new Set(duplicate_leads.map(d => d.lead_id));

    // Determine lead type from snapshot
    const snapshot = order.lead_data_snapshot || [];
    const leadType = snapshot[0]?.lead_type || 'final_expense';
    console.log(`Lead type: ${leadType}, replacing ${duplicate_leads.length} leads`);

    // Group needed replacements by state
    const neededByState = {};
    for (const d of duplicate_leads) {
      neededByState[d.state] = (neededByState[d.state] || 0) + 1;
    }
    console.log('Needed by state:', JSON.stringify(neededByState));

    // Get suppression list
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Also exclude leads already on this order (except the duplicates being replaced)
    const keepIds = new Set((order.leads_purchased || []).filter(id => !duplicateIds.has(id)));

    // Fetch sheet data
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    const sheetIds = {
      auto: '44023422', home: '1745292620', health: '1305861843',
      life: '113648240', medicare: '757044649', final_expense: '387991684',
      veteran_life: '1401332567', retirement: '712013125', annuity: '409761548', recruiting: '1894668336'
    };

    const sheetMetaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetMeta = await sheetMetaRes.json();
    const sheetMap = {};
    sheetMeta.sheets?.forEach(s => { sheetMap[s.properties.sheetId.toString()] = s.properties.title; });

    const sheetName = sheetMap[sheetIds[leadType]];
    if (!sheetName) return Response.json({ error: `Sheet not found for ${leadType}` }, { status: 400 });

    const range = `'${sheetName}'!A1:Z2000`;
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    if (rows.length < 2) return Response.json({ error: 'No data in sheet' }, { status: 400 });

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const getTier = (days) => {
      if (days <= 3) return 'tier1';
      if (days <= 14) return 'tier2';
      if (days <= 30) return 'tier3';
      if (days <= 90) return 'tier4';
      return 'tier5';
    };

    // Parse all available candidates
    const candidates = dataRows.map((row, index) => {
      const lead = {};
      headers.forEach((h, i) => { lead[h.trim().toLowerCase().replace(/\s+/g, '_')] = row[i] || ''; });
      lead.id = `${leadType}_${index}`;
      lead.lead_type = leadType;

      if (lead.external_id) {
        const dateStr = String(lead.external_id).split('-')[0];
        if (dateStr.length === 8) {
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6)) - 1;
          const day = parseInt(dateStr.substring(6, 8));
          const uploadDate = new Date(year, month, day);
          if (!isNaN(uploadDate.getTime())) {
            lead.age_in_days = Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
          }
        }
      }

      const statusVal = String(lead.status || '').trim().toLowerCase();
      lead._available = !soldIds.has(lead.id) && !keepIds.has(lead.id) && !duplicateIds.has(lead.id) &&
        (!statusVal || statusVal === 'available' || statusVal === 'undefined');
      return lead;
    }).filter(l => l._available);

    // Group candidates by state
    const candidatesByState = {};
    for (const c of candidates) {
      if (!candidatesByState[c.state]) candidatesByState[c.state] = [];
      candidatesByState[c.state].push(c);
    }

    // Pick replacements by state
    const replacements = [];
    const errors = [];
    for (const [state, count] of Object.entries(neededByState)) {
      const pool = candidatesByState[state] || [];
      if (pool.length < count) {
        errors.push(`Not enough ${state} leads: need ${count}, found ${pool.length}`);
        continue;
      }
      replacements.push(...pool.slice(0, count));
    }

    if (errors.length) {
      return Response.json({ error: errors.join('; ') }, { status: 400 });
    }

    if (dry_run) {
      return Response.json({
        dry_run: true,
        removing: duplicate_leads,
        adding: replacements.map(l => ({ id: l.id, name: l.first_name, state: l.state, age_in_days: l.age_in_days })),
        total_replacing: replacements.length
      });
    }

    // Build new leads_purchased and snapshot
    const newLeadIds = (order.leads_purchased || []).filter(id => !duplicateIds.has(id));
    const newSnapshot = snapshot.filter(s => !duplicateIds.has(s.lead_id || s.id));

    for (const lead of replacements) {
      const snap = { ...lead };
      delete snap._available;
      snap.lead_id = lead.id;
      newLeadIds.push(lead.id);
      newSnapshot.push(snap);
    }

    // Update order
    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newLeadIds.length
    });

    // Remove old suppression records for the duplicates
    for (const dup of duplicate_leads) {
      const existing = await base44.asServiceRole.entities.LeadSuppression.filter({ lead_id: dup.lead_id, order_id });
      for (const rec of existing) {
        await base44.asServiceRole.entities.LeadSuppression.delete(rec.id);
      }
    }

    // Add new suppression records
    for (const lead of replacements) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.id,
        tier: getTier(lead.age_in_days || 0),
        order_id,
        sale_date: new Date().toISOString()
      });
    }

    console.log(`Successfully replaced ${duplicate_leads.length} cross-order duplicate leads`);

    return Response.json({
      success: true,
      replaced_count: duplicate_leads.length,
      new_leads: replacements.map(l => ({ id: l.id, name: l.first_name, state: l.state })),
      total_leads: newLeadIds.length
    });

  } catch (error) {
    console.error('replaceCrossOrderDuplicates error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});