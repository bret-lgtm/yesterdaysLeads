import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lead_type, state_filter, count, exclude_ids } = await req.json();

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    const sheetIds = {
      final_expense: '387991684'
    };

    const sheetMetaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const sheetMeta = await sheetMetaResponse.json();
    const sheetMap = {};
    sheetMeta.sheets?.forEach(sheet => {
      sheetMap[sheet.properties.sheetId.toString()] = sheet.properties.title;
    });

    const sheetName = sheetMap[sheetIds[lead_type]];
    const range = `'${sheetName}'!A:Z`;
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const data = await response.json();
    const rows = data.values || [];
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Get suppression list
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Also exclude provided IDs
    const excludeSet = new Set(exclude_ids || []);

    const results = [];
    for (let i = 0; i < dataRows.length && results.length < count; i++) {
      const row = dataRows[i];
      const lead = {};
      headers.forEach((header, j) => {
        const cleanHeader = header.trim().toLowerCase().replace(/\s+/g, '_');
        lead[cleanHeader] = row[j] || '';
      });
      lead.id = `${lead_type}_${i}`;
      lead.lead_type = lead_type;

      if (soldLeadIds.has(lead.id)) continue;
      if (excludeSet.has(lead.id)) continue;
      if (!lead.state || !lead.state.toLowerCase().includes(state_filter.toLowerCase())) continue;
      if (lead.status && lead.status.trim().toLowerCase() !== 'available') continue;

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

      results.push(lead);
    }

    return Response.json({ success: true, leads: results });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});