import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Admin function to fix duplicate leads between orders
// Replaces duplicate leads on the most recent order with fresh leads

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'fix_duplicates';

    if (mode === 'fix_duplicates') {
      // Fix duplicate leads between order 69a06dc1271b07bac935bdc3 (newer) 
      // and order 6994a769c60211d2ee9885d1 (older)
      const NEWER_ORDER_ID = '69a06dc1271b07bac935bdc3';
      const OLDER_ORDER_ID = '6994a769c60211d2ee9885d1';

      const [newerOrder, olderOrder] = await Promise.all([
        base44.asServiceRole.entities.Order.get(NEWER_ORDER_ID),
        base44.asServiceRole.entities.Order.get(OLDER_ORDER_ID),
      ]);

      const newerSnapshot = newerOrder.lead_data_snapshot || [];
      const olderSnapshot = olderOrder.lead_data_snapshot || [];

      // Find duplicates by matching email (same person, different lead_id)
      const olderEmails = new Set(olderSnapshot.map(l => l.email?.toLowerCase()).filter(Boolean));
      const duplicates = newerSnapshot.filter(l => olderEmails.has(l.email?.toLowerCase()));
      const goodLeads = newerSnapshot.filter(l => !olderEmails.has(l.email?.toLowerCase()));

      console.log(`Duplicates found in newer order: ${duplicates.length}`);
      duplicates.forEach(l => console.log(`  - ${l.first_name} ${l.last_name} (${l.email}) lead_id: ${l.lead_id}`));

      if (duplicates.length === 0) {
        return Response.json({ message: 'No duplicates found', newerSnapshot: newerSnapshot.length });
      }

      // Get all suppressed lead IDs to avoid giving already-sold leads
      const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
      const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));
      // Also exclude all leads already in either order
      const allUsedLeadIds = new Set([
        ...(newerOrder.leads_purchased || []),
        ...(olderOrder.leads_purchased || [])
      ]);

      // Get access token for Google Sheets
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
      const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

      // Get sheet metadata
      const sheetMeta = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const sheetMetaJson = await sheetMeta.json();
      const sheetMap = {};
      sheetMetaJson.sheets?.forEach(s => { sheetMap[s.properties.sheetId.toString()] = s.properties.title; });

      // Fetch Final Expense sheet
      const feSheetName = sheetMap['387991684'];
      const feResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${feSheetName}'!A:Z`)}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const feData = await feResponse.json();
      const rows = feData.values || [];
      const headers = rows[0];
      const dataRows = rows.slice(1);

      // All emails already used (across both orders + duplicates being replaced)
      const allUsedEmails = new Set([
        ...olderSnapshot.map(l => l.email?.toLowerCase()).filter(Boolean),
        ...goodLeads.map(l => l.email?.toLowerCase()).filter(Boolean),
      ]);

      // Build candidate replacements - any available lead not sold, not in either order, not duplicate email
      const candidates = [];
      dataRows.forEach((row, index) => {
        const lead = {};
        headers.forEach((h, i) => {
          lead[h.trim().toLowerCase().replace(/\s+/g, '_')] = row[i] || '';
        });
        lead.lead_id = `final_expense_${index}`;
        lead.lead_type = 'final_expense';

        // Skip if sold or already in an order
        if (soldLeadIds.has(lead.lead_id)) return;
        if (allUsedLeadIds.has(lead.lead_id)) return;
        // Skip if email already used
        if (allUsedEmails.has(lead.email?.toLowerCase())) return;

        // Calculate age_in_days
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

        candidates.push(lead);
      });

      console.log(`Available replacement candidates: ${candidates.length}`);

      if (candidates.length < duplicates.length) {
        return Response.json({
          error: `Not enough replacements: need ${duplicates.length}, found ${candidates.length}`,
        }, { status: 400 });
      }

      // Pick replacements
      const replacements = candidates.slice(0, duplicates.length);

      // Build new snapshot
      const newSnapshot = [...goodLeads];
      for (const repl of replacements) {
        newSnapshot.push({
          first_name: repl.first_name,
          last_name: repl.last_name,
          email: repl.email,
          phone: repl.phone,
          date_of_birth: repl.date_of_birth,
          city: repl.city,
          state: repl.state,
          zip_code: repl.zip_code,
          type_of_coverage: repl.type_of_coverage,
          beneficiary: repl.beneficiary,
          favorite_hobby: repl.favorite_hobby,
          lead_id: repl.lead_id,
          lead_type: 'final_expense',
          age_in_days: repl.age_in_days || 0
        });
      }

      const newLeadsPurchased = newSnapshot.map(l => l.lead_id);

      // Update the order
      await base44.asServiceRole.entities.Order.update(NEWER_ORDER_ID, {
        lead_data_snapshot: newSnapshot,
        leads_purchased: newLeadsPurchased
      });

      // Remove suppression records for the duplicate leads from the newer order
      const duplicateLeadIds = new Set(duplicates.map(l => l.lead_id));
      const badSuppressions = suppressionRecords.filter(r => duplicateLeadIds.has(r.lead_id) && r.order_id === NEWER_ORDER_ID);
      for (const s of badSuppressions) {
        await base44.asServiceRole.entities.LeadSuppression.delete(s.id);
      }

      // Add suppression records for the replacements
      function getTierFromAge(age) {
        if (age >= 1 && age <= 3) return 'tier1';
        if (age >= 4 && age <= 14) return 'tier2';
        if (age >= 15 && age <= 30) return 'tier3';
        if (age >= 31 && age <= 90) return 'tier4';
        return 'tier5';
      }

      for (const repl of replacements) {
        await base44.asServiceRole.entities.LeadSuppression.create({
          lead_id: repl.lead_id,
          tier: getTierFromAge(repl.age_in_days || 1),
          order_id: NEWER_ORDER_ID,
          sale_date: new Date().toISOString()
        });
      }

      return Response.json({
        success: true,
        message: `Replaced ${duplicates.length} duplicate leads with fresh leads`,
        removed: duplicates.map(l => `${l.first_name} ${l.last_name} (${l.email})`),
        added: replacements.map(r => `${r.first_name} ${r.last_name} (${r.state}) - ${r.email}`),
        newSnapshotCount: newSnapshot.length
      });
    }

    return Response.json({ error: 'Unknown mode' }, { status: 400 });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});