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

    // Fetch the Final Expense sheet (sheetId 387991684 = "Final Expense Leads")
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Final%20Expense%20Leads`;
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