import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { dry_run = true } = await req.json().catch(() => ({}));

    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    if (!spreadsheetId) {
      return Response.json({ error: 'Missing GOOGLE_SHEET_ID' }, { status: 500 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Get all sold recruiting leads from LeadSuppression
    const allSuppressions = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const recruitingSuppressions = allSuppressions.filter(s => s.lead_id?.startsWith('recruiting_'));

    console.log(`Found ${recruitingSuppressions.length} sold recruiting suppression records`);

    if (recruitingSuppressions.length === 0) {
      return Response.json({ message: 'No sold recruiting leads found in LeadSuppression', count: 0 });
    }

    // Fetch header row from Recruiting Leads sheet
    const sheetName = 'Recruiting Leads';
    const headerRange = `'${sheetName}'!1:1`;
    const headerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(headerRange)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const headerData = await headerRes.json();
    const headers = headerData.values?.[0] || [];
    console.log('Headers:', headers);

    const getColumnLetter = (index) => {
      let letter = '';
      while (index >= 0) {
        letter = String.fromCharCode(65 + (index % 26)) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

    const getTierColumnLetter = (tier) => {
      const tierColumnName = tier.replace('tier', 'tier_');
      const colIndex = headers.findIndex(h => h.toLowerCase() === tierColumnName.toLowerCase());
      if (colIndex === -1) return null;
      return getColumnLetter(colIndex);
    };

    const updates = [];
    const errors = [];

    for (const suppression of recruitingSuppressions) {
      const parts = suppression.lead_id.split('_'); // recruiting_rowIndex
      const rowIndex = parseInt(parts[parts.length - 1]);
      if (isNaN(rowIndex)) {
        errors.push(`Invalid lead_id format: ${suppression.lead_id}`);
        continue;
      }
      const rowNumber = rowIndex + 2;
      const tier = suppression.tier;
      const colLetter = getTierColumnLetter(tier);

      if (!colLetter) {
        errors.push(`Tier column not found for tier: ${tier} (lead: ${suppression.lead_id})`);
        continue;
      }

      const range = `'${sheetName}'!${colLetter}${rowNumber}`;
      updates.push({ lead_id: suppression.lead_id, tier, range });
    }

    console.log(`Prepared ${updates.length} updates, ${errors.length} errors`);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        total_sold_recruiting_leads: recruitingSuppressions.length,
        updates_to_apply: updates.length,
        errors,
        sample_updates: updates.slice(0, 10)
      });
    }

    // Use a single batchUpdate to avoid rate limits
    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: updates.map(u => ({ range: u.range, values: [['Sold']] }))
        })
      }
    );

    let successCount = 0;
    if (!batchRes.ok) {
      const errText = await batchRes.text();
      console.error('batchUpdate failed:', errText);
      errors.push(`batchUpdate failed: ${errText}`);
    } else {
      successCount = updates.length;
      console.log(`batchUpdate succeeded: ${successCount} cells updated`);
    }

    return Response.json({
      success: true,
      total_sold_recruiting_leads: recruitingSuppressions.length,
      updated: successCount,
      errors
    });

  } catch (error) {
    console.error('backfillRecruitingTierStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});