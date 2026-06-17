import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { date_prefix, lead_type } = await req.json();

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    const sheetIds = {
      medicare: '757044649', final_expense: '387991684'
    };
    const sheetMap = {
      '757044649': 'Medicare Leads', '387991684': 'Final Expense Leads'
    };

    const results = {};

    for (const type of (lead_type ? [lead_type] : Object.keys(sheetIds))) {
      const sheetName = sheetMap[sheetIds[type]];
      const range = `'${sheetName}'!A1:Z200`;
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const sheetData = await sheetRes.json();
      const rows = sheetData.values || [];
      const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      
      results[type] = {
        headers,
        matching_rows: []
      };

      for (const [index, row] of rows.slice(1).entries()) {
        const lead = {};
        headers.forEach((h, i) => { lead[h] = row[i] !== undefined ? String(row[i]) : ''; });
        const eid = String(lead.external_id || '').trim();
        if (date_prefix && eid.startsWith(date_prefix)) {
          results[type].matching_rows.push({
            row_index: index,
            external_id: eid,
            state: lead.state || '',
            status: lead.status || '(empty)',
            first_name: lead.first_name || '',
            last_name: lead.last_name || '',
          });
        }
      }

      results[type].total_matching = results[type].matching_rows.length;
    }

    return Response.json({ results });
  } catch (error) {
    console.error('searchSheetLeads error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});