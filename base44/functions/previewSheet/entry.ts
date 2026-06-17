import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { sheet_name } = await req.json();

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    const range = `'${sheet_name}'!A1:H50000`;
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];

    // Show first 20 rows (including header)
    const preview = rows.slice(0, 21).map((row, i) => ({
      row: i,
      external_id: row[0] || '',
      first_name: row[1] || '',
      last_name: row[2] || '',
      state: row[7] || '',
      status: row[12] || '',
      tier1: row[13] || '',
    }));

    // Show last 10 rows
    const last = rows.slice(-10).map((row, i) => ({
      row: rows.length - 10 + i,
      external_id: row[0] || '',
      first_name: row[1] || '',
      last_name: row[2] || '',
      state: row[7] || '',
    }));

    return Response.json({ 
      total_rows: rows.length - 1,
      first_20: preview,
      last_10: last,
      unique_dates: [...new Set(rows.slice(1).map(r => String(r[0] || '').split('-')[0]))].filter(Boolean).sort()
    });
  } catch (error) {
    console.error('error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});