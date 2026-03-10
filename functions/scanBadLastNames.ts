import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    // Get sheet metadata
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const sheetMap = {};
    meta.sheets?.forEach(s => { sheetMap[s.properties.sheetId.toString()] = s.properties.title; });

    const sheetsToScan = {
      retirement: '712013125',
      final_expense: '387991684',
      life: '113648240',
      medicare: '757044649',
      auto: '44023422',
      home: '1745292620',
      health: '1305861843',
      veteran_life: '1401332567',
      annuity: '409761548',
      recruiting: '1894668336'
    };

    const badRows = [];

    for (const [leadType, sheetId] of Object.entries(sheetsToScan)) {
      const sheetName = sheetMap[sheetId];
      if (!sheetName) continue;

      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A:Z`)}?valueRenderOption=UNFORMATTED_VALUE`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      const rows = data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0];
      const lastNameColIndex = headers.findIndex(h => h.trim().toLowerCase().replace(/\s+/g, '_') === 'last_name');
      if (lastNameColIndex === -1) continue;

      rows.slice(1).forEach((row, i) => {
        const val = row[lastNameColIndex];
        if (val !== undefined && val !== '' && typeof val !== 'string') {
          badRows.push({
            sheet: sheetName,
            lead_type: leadType,
            row_number: i + 2, // +2 because slice(1) and 1-indexed
            last_name_value: val,
            last_name_type: typeof val,
            first_name: row[headers.findIndex(h => h.trim().toLowerCase() === 'first_name')] || '',
            external_id: row[headers.findIndex(h => h.trim().toLowerCase().replace(/\s+/g, '_') === 'external_id')] || ''
          });
        }
      });
    }

    console.log(`Found ${badRows.length} rows with non-string last_name values`);
    return Response.json({ bad_row_count: badRows.length, bad_rows: badRows });

  } catch (error) {
    console.error('scanBadLastNames error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});