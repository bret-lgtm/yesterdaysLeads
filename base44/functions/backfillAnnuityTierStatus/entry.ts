import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { dry_run = true } = await req.json().catch(() => ({}));

    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    if (!apiKey || !spreadsheetId) {
      return Response.json({ error: 'Missing GOOGLE_API_KEY or GOOGLE_SHEET_ID' }, { status: 500 });
    }

    // Get all sold annuity leads from LeadSuppression
    const allSuppressions = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const annuitySuppressions = allSuppressions.filter(s => s.lead_id?.startsWith('annuity_'));

    console.log(`Found ${annuitySuppressions.length} sold annuity suppression records`);

    if (annuitySuppressions.length === 0) {
      return Response.json({ message: 'No sold annuity leads found in LeadSuppression', count: 0 });
    }

    // Fetch header row from Annuity Leads sheet
    const sheetName = 'Annuity Leads';
    const headerRange = `'${sheetName}'!1:1`;
    const headerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(headerRange)}?key=${apiKey}`
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

    for (const suppression of annuitySuppressions) {
      const parts = suppression.lead_id.split('_'); // annuity_rowIndex
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
        total_sold_annuity_leads: annuitySuppressions.length,
        updates_to_apply: updates.length,
        errors,
        sample_updates: updates.slice(0, 10)
      });
    }

    // Apply updates one by one using PUT (same method as updateSheetTierStatus)
    let successCount = 0;

    for (const update of updates) {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(update.range)}?valueInputOption=RAW&key=${apiKey}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['Sold']] })
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Failed to update ${update.lead_id}:`, errText);
        errors.push(`Failed ${update.lead_id}: ${errText}`);
      } else {
        successCount++;
      }
    }

    console.log(`Done: ${successCount} updated, ${errors.length} errors`);

    return Response.json({
      success: true,
      total_sold_annuity_leads: annuitySuppressions.length,
      updated: successCount,
      errors
    });

  } catch (error) {
    console.error('backfillAnnuityTierStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});