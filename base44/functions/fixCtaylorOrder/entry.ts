import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { dry_run = true } = await req.json().catch(() => ({}));
    const ORDER_ID = '6a147a90e2235ad9ed8b227e';
    const DUPLICATE_LEAD_ID = 'final_expense_915'; // Anabel Duran - email dupe of final_expense_15101

    const order = await base44.asServiceRole.entities.Order.get(ORDER_ID);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

    const snapshot = order.lead_data_snapshot || [];
    const goodSnapshot = snapshot.filter(l => l.lead_id !== DUPLICATE_LEAD_ID);
    const dupeLead = snapshot.find(l => l.lead_id === DUPLICATE_LEAD_ID);

    if (!dupeLead) {
      return Response.json({ message: 'Duplicate already removed, nothing to do' });
    }

    console.log(`Removing duplicate: ${dupeLead.first_name} ${dupeLead.last_name} (${dupeLead.email}) lead_id: ${DUPLICATE_LEAD_ID}`);

    // Get suppression records to avoid re-selling leads
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));
    const allOnOrder = new Set(order.leads_purchased || []);
    const allEmails = new Set(goodSnapshot.map(l => l.email?.toLowerCase()).filter(Boolean));

    // Fetch Final Expense sheet to find a replacement
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    const sheetName = 'Final Expense Leads';

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A:Z`)}?valueRenderOption=UNFORMATTED_VALUE&key=${apiKey}`
    );
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Find best replacement: not sold, not on order, no email dupe, has all required fields
    const candidates = [];
    dataRows.forEach((row, index) => {
      const lead = {};
      headers.forEach((h, i) => {
        lead[h.trim().toLowerCase().replace(/\s+/g, '_')] = row[i] ?? '';
      });
      lead.lead_id = `final_expense_${index}`;
      lead.lead_type = 'final_expense';

      if (soldLeadIds.has(lead.lead_id)) return;
      if (allOnOrder.has(lead.lead_id)) return;
      const em = lead.email?.toLowerCase();
      if (em && allEmails.has(em)) return;
      if (!lead.first_name || !lead.last_name || !lead.phone) return;

      // Calculate age
      if (lead.external_id) {
        const dateStr = String(lead.external_id).split('-')[0];
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

    console.log(`Found ${candidates.length} replacement candidates`);

    if (candidates.length === 0) {
      return Response.json({ error: 'No replacement candidates available' }, { status: 400 });
    }

    // Pick a candidate in the same age range as the duplicate (tier5 = 90+ days)
    // Duplicate was age_in_days ~= the other old leads. Pick from same general age bucket.
    const dupAge = dupeLead.age_in_days || 90;
    candidates.sort((a, b) => Math.abs((a.age_in_days || 999) - dupAge) - Math.abs((b.age_in_days || 999) - dupAge));
    const replacement = candidates[0];

    console.log(`Replacement: ${replacement.first_name} ${replacement.last_name} (${replacement.state}) age=${replacement.age_in_days}`);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        removing: { lead_id: DUPLICATE_LEAD_ID, name: `${dupeLead.first_name} ${dupeLead.last_name}`, email: dupeLead.email },
        replacement: { lead_id: replacement.lead_id, name: `${replacement.first_name} ${replacement.last_name}`, state: replacement.state, age_in_days: replacement.age_in_days }
      });
    }

    // Build new snapshot with replacement
    const newSnapshotEntry = {
      external_id: replacement.external_id,
      first_name: replacement.first_name,
      last_name: replacement.last_name,
      email: replacement.email,
      phone: replacement.phone,
      date_of_birth: replacement.date_of_birth,
      city: replacement.city,
      state: replacement.state,
      zip_code: replacement.zip_code,
      type_of_coverage: replacement.type_of_coverage,
      beneficiary: replacement.beneficiary,
      favorite_hobby: replacement.favorite_hobby,
      lead_id: replacement.lead_id,
      lead_type: 'final_expense',
      age_in_days: replacement.age_in_days || 0
    };

    const newSnapshot = [...goodSnapshot, newSnapshotEntry];
    const newLeadsPurchased = newSnapshot.map(l => l.lead_id);

    await base44.asServiceRole.entities.Order.update(ORDER_ID, {
      lead_data_snapshot: newSnapshot,
      leads_purchased: newLeadsPurchased,
      lead_count: newSnapshot.length
    });

    // Remove suppression for the duplicate (final_expense_915)
    const badSuppressions = suppressionRecords.filter(r => r.lead_id === DUPLICATE_LEAD_ID && r.order_id === ORDER_ID);
    for (const s of badSuppressions) {
      await base44.asServiceRole.entities.LeadSuppression.delete(s.id);
    }

    // Add suppression for replacement
    function getTierFromAge(age) {
      if (age >= 1 && age <= 3) return 'tier1';
      if (age >= 4 && age <= 14) return 'tier2';
      if (age >= 15 && age <= 30) return 'tier3';
      if (age >= 31 && age <= 90) return 'tier4';
      return 'tier5';
    }

    await base44.asServiceRole.entities.LeadSuppression.create({
      lead_id: replacement.lead_id,
      tier: getTierFromAge(replacement.age_in_days || 90),
      order_id: ORDER_ID,
      sale_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      removed: { lead_id: DUPLICATE_LEAD_ID, name: `${dupeLead.first_name} ${dupeLead.last_name}` },
      added: { lead_id: replacement.lead_id, name: `${replacement.first_name} ${replacement.last_name}`, state: replacement.state, age_in_days: replacement.age_in_days },
      new_count: newSnapshot.length
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});