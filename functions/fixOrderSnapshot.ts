import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// One-time admin function to fix order #69a1ce56b5396e76dca70569 by replacing NY/NJ leads
// with leads from TX, MA, FL

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const ORDER_ID = '69a1ce56b5396e76dca70569';
    const VALID_STATES = ['TX', 'MA', 'FL'];

    // 1. Get the order
    const order = await base44.asServiceRole.entities.Order.get(ORDER_ID);
    const snapshot = order.lead_data_snapshot || [];

    // 2. Find bad leads (NY or NJ)
    const badLeads = snapshot.filter(l => l.state === 'NY' || l.state === 'NJ');
    const goodLeads = snapshot.filter(l => l.state !== 'NY' && l.state !== 'NJ');
    
    console.log(`Total leads: ${snapshot.length}`);
    console.log(`Bad leads (NY/NJ): ${badLeads.length}`, badLeads.map(l => `${l.lead_id} - ${l.first_name} ${l.last_name} (${l.state})`));
    console.log(`Good leads: ${goodLeads.length}`);

    if (badLeads.length === 0) {
      return Response.json({ message: 'No NY/NJ leads found in this order', snapshot: snapshot.length });
    }

    // 3. Get access token for Google Sheets
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    // 4. Get all currently suppressed lead IDs to avoid re-using sold leads
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));
    const alreadyInOrder = new Set(order.leads_purchased || []);

    // 5. Fetch Final Expense sheet to find TX/MA/FL replacements
    const sheetMeta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const sheetMetaJson = await sheetMeta.json();
    const sheetMap = {};
    sheetMetaJson.sheets?.forEach(s => { sheetMap[s.properties.sheetId.toString()] = s.properties.title; });

    const feSheetName = sheetMap['387991684'];
    const feResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${feSheetName}'!A:Z`)}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const feData = await feResponse.json();
    const rows = feData.values || [];
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Build candidate replacement leads from TX, MA, FL
    const candidates = [];
    dataRows.forEach((row, index) => {
      const lead = {};
      headers.forEach((h, i) => {
        lead[h.trim().toLowerCase().replace(/\s+/g, '_')] = row[i] || '';
      });
      lead.lead_id = `final_expense_${index}`;
      lead.lead_type = 'final_expense';

      // Only include if state is TX, MA, or FL
      const state = (lead.state || '').toUpperCase().trim();
      if (!VALID_STATES.includes(state)) return;

      // Skip if already sold or already in order
      if (soldLeadIds.has(lead.lead_id)) return;
      if (alreadyInOrder.has(lead.lead_id)) return;

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

    console.log(`Available replacement candidates from TX/MA/FL: ${candidates.length}`);

    if (candidates.length < badLeads.length) {
      return Response.json({ 
        error: `Not enough replacements: need ${badLeads.length}, found ${candidates.length}`,
        candidates: candidates.length
      }, { status: 400 });
    }

    // 6. Pick replacements (take first N)
    const replacements = candidates.slice(0, badLeads.length);

    // 7. Build the cleaned snapshot with replacements swapped in
    const newSnapshot = [...goodLeads];
    
    // Build replacement lead objects matching the snapshot format
    for (const repl of replacements) {
      const cleanLead = {
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
      };
      newSnapshot.push(cleanLead);
    }

    // 8. Update the order snapshot and leads_purchased
    const newLeadsPurchased = [...goodLeads.map(l => l.lead_id), ...replacements.map(r => r.lead_id)];
    
    await base44.asServiceRole.entities.Order.update(ORDER_ID, {
      lead_data_snapshot: newSnapshot,
      leads_purchased: newLeadsPurchased
    });

    // 9. Create suppression records for the new replacement leads (and remove old bad ones)
    // Remove suppression records for the bad NY/NJ leads
    const badLeadIds = badLeads.map(l => l.lead_id);
    const badSuppressionRecords = suppressionRecords.filter(r => badLeadIds.includes(r.lead_id) && r.order_id === ORDER_ID);
    for (const s of badSuppressionRecords) {
      await base44.asServiceRole.entities.LeadSuppression.delete(s.id);
    }

    // Add suppression records for the replacement leads
    function getTierFromAge(ageInDays) {
      if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
      if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
      if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
      if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
      return 'tier5';
    }

    for (const repl of replacements) {
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: repl.lead_id,
        tier: getTierFromAge(repl.age_in_days || 1),
        order_id: ORDER_ID,
        sale_date: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      message: `Replaced ${badLeads.length} NY/NJ leads with ${replacements.length} TX/MA/FL leads`,
      replaced: badLeads.map(l => `${l.first_name} ${l.last_name} (${l.state}) → removed`),
      added: replacements.map(r => `${r.first_name} ${r.last_name} (${r.state})`),
      newSnapshotCount: newSnapshot.length,
      newLeadsPurchasedCount: newLeadsPurchased.length
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});