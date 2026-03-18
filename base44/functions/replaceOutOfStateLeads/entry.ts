import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { order_id, allowed_states, dry_run = false } = await req.json();
    if (!order_id || !allowed_states?.length) {
      return Response.json({ error: 'order_id and allowed_states required' }, { status: 400 });
    }

    // Fetch the order
    const order = await base44.asServiceRole.entities.Order.get(order_id);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

    const snapshot = order.lead_data_snapshot || [];
    const allowedSet = new Set(allowed_states.map(s => s.toUpperCase()));

    // Split into good and bad leads
    const goodLeads = snapshot.filter(l => allowedSet.has((l.state || '').toUpperCase()));
    const badLeads = snapshot.filter(l => !allowedSet.has((l.state || '').toUpperCase()));
    const neededCount = badLeads.length;

    console.log(`Order ${order_id}: ${goodLeads.length} good leads, ${badLeads.length} bad leads (${badLeads.map(l => l.state).join(', ')})`);

    if (neededCount === 0) {
      return Response.json({ message: 'No out-of-state leads found. Nothing to replace.', bad_leads: [] });
    }

    if (dry_run) {
      return Response.json({
        dry_run: true,
        bad_lead_count: badLeads.length,
        bad_leads: badLeads.map(l => ({ lead_id: l.lead_id, name: l.first_name, state: l.state })),
        message: `Would replace ${badLeads.length} leads`
      });
    }

    // Get all sold lead IDs to exclude
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));
    // Also exclude leads already in this order
    snapshot.forEach(l => soldLeadIds.add(l.lead_id));
    // Remove bad leads from the exclusion so we don't double-exclude
    badLeads.forEach(l => soldLeadIds.delete(l.lead_id));

    // Fetch leads from sheets using the Google Sheets connector
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    // Detect the lead type from the order
    const leadType = snapshot[0]?.lead_type || 'final_expense';
    const sheetIds = {
      auto: '44023422', home: '1745292620', health: '1305861843', life: '113648240',
      medicare: '757044649', final_expense: '387991684', veteran_life: '1401332567',
      retirement: '712013125', annuity: '409761548', recruiting: '1894668336'
    };
    const sheetId = sheetIds[leadType];

    // Get sheet name
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const sheetName = meta.sheets?.find(s => s.properties.sheetId.toString() === sheetId)?.properties.title;
    if (!sheetName) return Response.json({ error: `Sheet not found for ${leadType}` }, { status: 500 });

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A:Z`)}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    if (rows.length < 2) return Response.json({ error: 'Sheet has no data' }, { status: 500 });

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Parse all leads from the sheet
    const allSheetLeads = dataRows.map((row, index) => {
      const lead = {};
      headers.forEach((header, i) => {
        const cleanHeader = header.trim().toLowerCase().replace(/\s+/g, '_');
        lead[cleanHeader] = row[i] || '';
      });
      lead.lead_id = `${leadType}_${index}`;
      lead.lead_type = leadType;

      // Calculate age
      if (lead.external_id) {
        const dateStr = lead.external_id.split('-')[0];
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
      return lead;
    });

    // Find available replacement leads in allowed states
    const replacements = allSheetLeads.filter(lead => {
      if (soldLeadIds.has(lead.lead_id)) return false;
      const status = (lead.status || '').trim().toLowerCase();
      if (status && status !== 'available' && status !== 'undefined' && status !== '') return false;
      return allowedSet.has(String(lead.state || '').toUpperCase());
    });

    console.log(`Found ${replacements.length} available replacement leads in ${allowed_states.join('/')}`);

    if (replacements.length < neededCount) {
      return Response.json({
        error: `Not enough replacement leads available. Need ${neededCount}, found ${replacements.length}.`,
        available_replacements: replacements.length,
        needed: neededCount
      }, { status: 400 });
    }

    // Pick the replacements (take first neededCount)
    const chosenReplacements = replacements.slice(0, neededCount);

    // Build new snapshot and lead IDs
    const newSnapshot = [
      ...goodLeads,
      ...chosenReplacements.map(lead => {
        const cleaned = { ...lead };
        if (cleaned.last_name) {
          cleaned.last_name_initial = cleaned.last_name.charAt(0).toUpperCase();
          delete cleaned.last_name;
        }
        return cleaned;
      })
    ];
    const newLeadIds = newSnapshot.map(l => l.lead_id);

    // Update the order
    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: newLeadIds,
      lead_data_snapshot: newSnapshot,
      lead_count: newSnapshot.length
    });

    // Remove suppression records for bad leads
    for (const badLead of badLeads) {
      const records = suppressionRecords.filter(r => r.lead_id === badLead.lead_id && r.order_id === order_id);
      for (const rec of records) {
        await base44.asServiceRole.entities.LeadSuppression.delete(rec.id);
      }
    }

    // Add suppression records for new replacement leads
    function getTierFromAge(age) {
      if (age >= 1 && age <= 3) return 'tier1';
      if (age >= 4 && age <= 14) return 'tier2';
      if (age >= 15 && age <= 30) return 'tier3';
      if (age >= 31 && age <= 90) return 'tier4';
      return 'tier5';
    }
    for (const lead of chosenReplacements) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: lead.lead_id,
        tier: getTierFromAge(lead.age_in_days || 1),
        order_id: order_id,
        sale_date: new Date().toISOString()
      });
    }

    console.log(`Successfully replaced ${badLeads.length} leads with ${chosenReplacements.length} TX/FL leads`);

    return Response.json({
      success: true,
      replaced_count: badLeads.length,
      removed_leads: badLeads.map(l => ({ lead_id: l.lead_id, name: l.first_name, state: l.state })),
      added_leads: chosenReplacements.map(l => ({ lead_id: l.lead_id, name: l.first_name, state: l.state })),
      total_leads: newSnapshot.length
    });

  } catch (error) {
    console.error('replaceOutOfStateLeads error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});