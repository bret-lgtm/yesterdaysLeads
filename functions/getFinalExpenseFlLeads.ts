import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlesheets");
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");

    // First get sheet metadata to find exact sheet name
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const meta = await metaRes.json();
    const sheets = meta.sheets?.map(s => s.properties?.title) || [];
    console.log('Available sheets:', JSON.stringify(sheets));

    const feSheetName = sheets.find(s => s.toLowerCase().includes('final'));
    if (!feSheetName) {
      return Response.json({ error: 'Final Expense sheet not found', available: sheets });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(feSheetName)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await res.json();
    if (!data.values || data.values.length < 2) {
      return Response.json({ leads: [], message: 'No data found' });
    }

    const headers = data.values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const rows = data.values.slice(1);

    const stateIdx = headers.indexOf('state');
    const flLeads = rows
      .filter(row => row[stateIdx]?.toString().trim().toUpperCase() === 'FL')
      .slice(0, 10)
      .map((row, i) => {
        const lead = {};
        headers.forEach((h, idx) => { lead[h] = row[idx] ?? ''; });
        lead.lead_type = 'final_expense';
        lead.row_index = rows.indexOf(row); // for reference
        return lead;
      });

    return Response.json({ leads: flLeads, total: flLeads.length });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});