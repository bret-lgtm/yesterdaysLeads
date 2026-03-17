import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { order_id, count, allowed_states = [], age_min = 1, age_max = 3, dry_run = true } = await req.json();

    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const snapshot = order.lead_data_snapshot || [];
    const leadType = snapshot[0]?.lead_type || 'final_expense';
    const existingIds = new Set(order.leads_purchased || []);

    // Get suppression list
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Fetch sheet
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

    const range = `'${sheetName}'!A1:Z10000`;
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
      const available = !soldIds.has(lead.id) && !existingIds.has(lead.id) &&
        (!statusVal || statusVal === 'available' || statusVal === 'undefined');
      const ageOk = lead.age_in_days >= age_min && lead.age_in_days <= age_max;
      const stateOk = allowed_states.length === 0 || allowed_states.includes(lead.state);
      lead._available = available && ageOk && stateOk;
      return lead;
    }).filter(l => l._available);

    console.log(`Found ${candidates.length} candidates (age ${age_min}-${age_max} days, states: ${allowed_states.join(',')})`);

    const needed = count || candidates.length;
    if (candidates.length < needed) {
      return Response.json({
        error: `Not enough leads. Need ${needed}, found ${candidates.length}`,
        available_preview: candidates.slice(0, 10).map(l => ({ id: l.id, state: l.state, age_in_days: l.age_in_days }))
      }, { status: 400 });
    }

    const additions = candidates.slice(0, needed);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        found: candidates.length,
        would_add: additions.map(l => ({ id: l.id, name: l.first_name, state: l.state, age_in_days: l.age_in_days }))
      });
    }

    // Build new lists
    const newLeadIds = [...(order.leads_purchased || []), ...additions.map(l => l.id)];
    const newSnapshot = [...snapshot];
    for (const lead of additions) {
      const snap = { ...lead };
      delete snap._available;
      snap.lead_id = lead.id;
      newSnapshot.push(snap);
    }

    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newLeadIds.length
    });

    for (const lead of additions) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.id,
        tier: getTier(lead.age_in_days || 1),
        order_id,
        sale_date: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      added_count: additions.length,
      added_leads: additions.map(l => ({ id: l.id, name: l.first_name, state: l.state, age_in_days: l.age_in_days })),
      total_leads: newLeadIds.length
    });

  } catch (error) {
    console.error('addLeadsToOrder error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});