import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { order_id, dry_run = true, allowed_states = [] } = await req.json();

    // Load the order
    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    if (!orders.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orders[0];

    const allLeadIds = order.leads_purchased || [];
    const snapshot = order.lead_data_snapshot || [];

    // Find unique and duplicate IDs
    const seen = new Set();
    const uniqueIds = [];
    const duplicateIds = [];
    for (const id of allLeadIds) {
      if (seen.has(id)) {
        duplicateIds.push(id);
      } else {
        seen.add(id);
        uniqueIds.push(id);
      }
    }

    const neededCount = duplicateIds.length;
    console.log(`Order ${order_id}: ${uniqueIds.length} unique leads, ${neededCount} duplicates to replace`);

    if (neededCount === 0) {
      return Response.json({ message: 'No duplicates found', order_id });
    }

    // Determine lead type from existing leads
    const leadType = snapshot[0]?.lead_type || allLeadIds[0]?.split('_').slice(0, -1).join('_');
    console.log(`Lead type: ${leadType}`);

    // Get all sold lead IDs for suppression
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list();
    const soldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Fetch leads from Google Sheets
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

    // Fetch rows
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

    // Parse and filter candidates — must not be in uniqueIds (already on order) or sold
    const alreadyOnOrder = new Set(uniqueIds);

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
      lead._available = !soldIds.has(lead.id) && !alreadyOnOrder.has(lead.id) &&
        (!statusVal || statusVal === 'available' || statusVal === 'undefined');
      return lead;
    }).filter(l => l._available && (allowed_states.length === 0 || allowed_states.includes(l.state)));

    console.log(`Found ${candidates.length} available replacement candidates`);

    if (candidates.length < neededCount) {
      return Response.json({
        error: `Not enough replacement leads. Need ${neededCount}, found ${candidates.length}`
      }, { status: 400 });
    }

    const replacements = candidates.slice(0, neededCount);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        duplicate_count: neededCount,
        duplicates: duplicateIds,
        unique_count: uniqueIds.length,
        would_add: replacements.map(l => ({ id: l.id, name: l.first_name, state: l.state }))
      });
    }

    // Build new snapshot: keep existing unique entries, add new replacements
    const existingSnapshot = snapshot.filter(s => uniqueIds.includes(s.lead_id));

    const getTier = (days) => {
      if (days <= 3) return 'tier1';
      if (days <= 14) return 'tier2';
      if (days <= 30) return 'tier3';
      if (days <= 90) return 'tier4';
      return 'tier5';
    };

    const newSnapshotEntries = replacements.map(l => {
      const snap = { ...l };
      delete snap._available;
      snap.lead_id = l.id;
      return snap;
    });

    const newSnapshot = [...existingSnapshot, ...newSnapshotEntries];
    const newLeadIds = [...uniqueIds, ...replacements.map(l => l.id)];

    // Update order
    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newLeadIds.length
    });

    // Add suppression records for new leads
    for (const lead of replacements) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.id,
        tier: getTier(lead.age_in_days || 0),
        order_id: order_id,
        sale_date: new Date().toISOString()
      });
    }

    console.log(`Successfully replaced ${neededCount} duplicate leads with new unique leads`);

    return Response.json({
      success: true,
      duplicate_count: neededCount,
      replaced_with: replacements.map(l => ({ id: l.id, name: l.first_name, state: l.state })),
      total_leads: newLeadIds.length
    });

  } catch (error) {
    console.error('fixDuplicateLeads error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});