import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { order_id, correct_lead_type, dry_run = true } = await req.json();

    // Load the order
    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const wrongLeadIds = order.leads_purchased || [];
    const neededCount = wrongLeadIds.length;

    console.log(`Order ${order_id}: replacing ${neededCount} wrong-type leads with ${correct_lead_type}`);

    // Get suppression list to exclude already-sold leads
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Fetch the correct lead type sheet from Google Sheets
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

    const sheetName = sheetMap[sheetIds[correct_lead_type]];
    if (!sheetName) return Response.json({ error: `Sheet not found for ${correct_lead_type}` }, { status: 400 });

    // Only fetch first 500 rows since we need very few leads
    const range = `'${sheetName}'!A1:Z500`;
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    if (rows.length < 2) return Response.json({ error: 'No data in sheet' }, { status: 400 });

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Parse leads
    const candidates = dataRows.map((row, index) => {
      const lead = {};
      headers.forEach((h, i) => { lead[h.trim().toLowerCase().replace(/\s+/g, '_')] = row[i] || ''; });
      lead.id = `${correct_lead_type}_${index}`;
      lead.lead_type = correct_lead_type;

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
      lead._available = !soldIds.has(lead.id) && (!statusVal || statusVal === 'available' || statusVal === 'undefined');
      return lead;
    }).filter(l => l._available);

    console.log(`Found ${candidates.length} available ${correct_lead_type} leads`);

    if (candidates.length < neededCount) {
      return Response.json({ error: `Not enough ${correct_lead_type} leads available. Need ${neededCount}, found ${candidates.length}` }, { status: 400 });
    }

    const replacements = candidates.slice(0, neededCount);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        would_remove: wrongLeadIds,
        would_add: replacements.map(l => ({ id: l.id, name: l.first_name, state: l.state }))
      });
    }

    // Build new snapshot
    const newSnapshot = replacements.map(l => {
      const snap = { ...l };
      delete snap._available;
      snap.lead_id = l.id;
      if (snap.last_name) {
        snap.last_name_initial = String(snap.last_name).charAt(0).toUpperCase();
        // keep last_name in snapshot for customer use
      }
      return snap;
    });

    const newLeadIds = replacements.map(l => l.id);

    // Update order
    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: neededCount
    });

    // Remove old suppression records
    for (const lid of wrongLeadIds) {
      const existing = await base44.asServiceRole.entities.LeadSuppression.filter({ lead_id: lid });
      for (const rec of existing) {
        await base44.asServiceRole.entities.LeadSuppression.delete(rec.id);
      }
    }

    // Add new suppression records
    const getTier = (days) => {
      if (days <= 3) return 'tier1';
      if (days <= 14) return 'tier2';
      if (days <= 30) return 'tier3';
      if (days <= 90) return 'tier4';
      return 'tier5';
    };

    for (const lead of replacements) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.id,
        tier: getTier(lead.age_in_days || 0),
        order_id: order_id,
        sale_date: new Date().toISOString()
      });
    }

    console.log(`Successfully replaced ${wrongLeadIds.length} wrong-type leads with ${correct_lead_type} leads`);

    return Response.json({
      success: true,
      replaced_count: neededCount,
      removed: wrongLeadIds,
      added: replacements.map(l => ({ id: l.id, name: l.first_name, state: l.state }))
    });

  } catch (error) {
    console.error('fixWrongLeadType error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});