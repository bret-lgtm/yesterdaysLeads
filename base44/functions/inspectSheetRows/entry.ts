import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { external_ids } = await req.json();

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    const sheetIds = {
      auto: '44023422', home: '1745292620', health: '1305861843',
      life: '113648240', medicare: '757044649', final_expense: '387991684',
      veteran_life: '1401332567', retirement: '712013125', annuity: '409761548', recruiting: '1894668336'
    };

    const sheetMap = {
      '44023422': 'Auto Leads', '113648240': 'Life Leads', '387991684': 'Final Expense Leads',
      '409761548': 'Annuity Leads', '712013125': 'Retirement Leads', '757044649': 'Medicare Leads',
      '1305861843': 'Health Leads', '1401332567': 'Veteran Life Leads', '1745292620': 'Home Leads',
      '1894668336': 'Recruiting Leads'
    };

    const results = {};

    // Figure out which sheets to check based on the external_ids
    const sheetsToCheck = new Set();
    for (const eid of external_ids) {
      const parts = String(eid).split('-');
      if (parts.length >= 3) {
        const type = parts[1].toLowerCase();
        const typeMap = { med: 'medicare', fe: 'final_expense', au: 'auto', ho: 'home',
          he: 'health', li: 'life', ve: 'veteran_life', re: 'retirement', an: 'annuity', rec: 'recruiting' };
        const mapped = typeMap[type] || type;
        if (sheetIds[mapped]) sheetsToCheck.add(mapped);
      }
    }

    for (const leadType of sheetsToCheck) {
      const sheetName = sheetMap[sheetIds[leadType]];
      if (!sheetName) continue;

      const range = `'${sheetName}'!A1:Z50000`;
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const sheetData = await sheetRes.json();
      const rows = sheetData.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const dataRows = rows.slice(1);

      results[leadType] = [];

      for (const eid of external_ids) {
        for (const [index, row] of dataRows.entries()) {
          const lead = {};
          headers.forEach((h, i) => { lead[h] = row[i] !== undefined ? String(row[i]) : ''; });
          if (String(lead.external_id || '').trim() === eid) {
            // Calculate age
            let age = null;
            const dateStr = String(lead.external_id).split('-')[0];
            if (dateStr.length === 8) {
              const year = parseInt(dateStr.substring(0, 4));
              const month = parseInt(dateStr.substring(4, 6)) - 1;
              const day = parseInt(dateStr.substring(6, 8));
              const uploadDate = new Date(year, month, day);
              if (!isNaN(uploadDate.getTime())) {
                age = Math.floor((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
              }
            }

            results[leadType].push({
              row_index: index,
              sheet_id: `${leadType}_${index}`,
              raw_data: lead,
              age_in_days: age,
              status_raw: lead.status || '(empty)',
              state_raw: lead.state || '(empty)',
            });
          }
        }
      }
    }

    return Response.json({ results });

  } catch (error) {
    console.error('inspectSheetRows error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});