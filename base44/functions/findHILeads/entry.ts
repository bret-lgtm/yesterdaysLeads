import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Get all suppressed lead IDs
  const suppressions = await base44.asServiceRole.entities.LeadSuppression.list();
  const suppressedIds = new Set(suppressions.map(s => s.lead_id));

  // Already in this order
  const alreadyInOrder = new Set([
    'final_expense_15744','final_expense_15742','final_expense_15731',
    'final_expense_16457','final_expense_16450','final_expense_16420',
    'final_expense_16302','final_expense_16272','final_expense_16196',
    'final_expense_16181','final_expense_16106','final_expense_16074',
    'final_expense_16028','final_expense_16613','final_expense_16727',
    'final_expense_16699','final_expense_16814','final_expense_16807',
    'final_expense_16804','final_expense_16781','final_expense_16873',
    'final_expense_16824','final_expense_16989','final_expense_16979',
    'final_expense_19130','final_expense_19237','final_expense_20246',
    'final_expense_20245','final_expense_20241','final_expense_20316',
    'final_expense_20306','final_expense_20299',
    // The 8 bad ones we're replacing:
    'final_expense_20795','final_expense_20792','final_expense_20746',
    'final_expense_20743','final_expense_20619','final_expense_20605',
    'final_expense_20589'
  ]);

  // Fetch the Final Expense sheet
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
  const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

  // Get sheet metadata
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const meta = await metaRes.json();
  const feSheet = meta.sheets.find(s => s.properties.title === 'Final Expense Leads');
  const sheetId = feSheet.properties.sheetId;

  // Fetch all rows
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Final%20Expense%20Leads`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await dataRes.json();
  const rows = data.values;
  const headers = rows[0];

  const results = [];
  for (let i = 1; i < rows.length && results.length < 20; i++) {
    const row = rows[i];
    const obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx] || '');
    
    const state = obj['state'] || '';
    const rowNum = i; // 0-indexed after headers = row i+1 in sheet (1-indexed header = row 1)
    const leadId = `final_expense_${i - 1}`; // index-based ID

    if (state === 'HI') {
      // Check tier4 availability
      const tier4 = obj['tier_4'] || obj['Tier 4'] || obj['tier4'] || '';
      if (tier4.toLowerCase() !== 'sold' && !suppressedIds.has(leadId) && !alreadyInOrder.has(leadId)) {
        results.push({
          lead_id: leadId,
          row_index: i,
          first_name: obj['first_name'] || obj['First Name'],
          last_name: obj['last_name'] || obj['Last Name'],
          email: obj['email'] || obj['Email'],
          phone: obj['phone'] || obj['Phone'],
          state,
          zip_code: obj['zip_code'] || obj['Zip Code'],
          tier4
        });
      }
    }
  }

  return Response.json({ found: results.length, leads: results });
});