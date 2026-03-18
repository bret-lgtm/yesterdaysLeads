import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { lead_type = 'final_expense' } = await req.json();

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
    const sheetName = sheetMap[sheetIds[lead_type]];

    // Fetch all rows
    const range = `'${sheetName}'!A1:Z10000`;
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Get suppression list
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Parse and count available by state
    const stateCount = {};
    let totalAvailable = 0;
    dataRows.forEach((row, index) => {
      const lead = {};
      headers.forEach((h, i) => { lead[h.trim().toLowerCase().replace(/\s+/g, '_')] = row[i] || ''; });
      const leadId = `${lead_type}_${index}`;
      const statusVal = String(lead.status || '').trim().toLowerCase();
      const available = !soldIds.has(leadId) && (!statusVal || statusVal === 'available' || statusVal === 'undefined');
      if (available) {
        const state = lead.state || 'UNKNOWN';
        stateCount[state] = (stateCount[state] || 0) + 1;
        totalAvailable++;
      }
    });

    // Sort by count desc
    const sorted = Object.entries(stateCount).sort((a, b) => b[1] - a[1]);

    return Response.json({ lead_type, total_available: totalAvailable, total_rows: dataRows.length, states: sorted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});