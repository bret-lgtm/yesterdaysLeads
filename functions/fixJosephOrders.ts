import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// All leads Joseph already has across all orders (union of all 3 orders)
const ORDER1_ID = '699745d0b489f0c1f7c1fd73'; // 77 leads
const ORDER2_ID = '699748eebade54de3b3ea50d'; // 37 leads (17 are dupes of order 1)
const ORDER3_ID = '69975592f201743d1170b911'; // 36 leads (all dupes)

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ---- Define the 3 orders' lead lists ----
    const order1Leads = ['final_expense_11501', 'final_expense_11500', 'final_expense_11490', 'final_expense_11486', 'final_expense_11484', 'final_expense_11483', 'final_expense_11481', 'final_expense_11479', 'final_expense_11477', 'final_expense_11475', 'final_expense_11468', 'final_expense_11463', 'final_expense_11460', 'final_expense_11456', 'final_expense_11455', 'final_expense_11454', 'final_expense_11452', 'final_expense_11451', 'final_expense_11448', 'final_expense_11416', 'final_expense_11414', 'final_expense_11408', 'final_expense_11405', 'final_expense_11404', 'final_expense_11403', 'final_expense_11402', 'final_expense_11397', 'final_expense_11396', 'final_expense_11395', 'final_expense_11391', 'final_expense_11388', 'final_expense_11382', 'final_expense_11378', 'final_expense_11371', 'final_expense_11369', 'final_expense_11367', 'final_expense_11358', 'final_expense_11354', 'final_expense_11348', 'final_expense_11346', 'final_expense_11335', 'final_expense_11327', 'final_expense_11326', 'final_expense_11324', 'final_expense_11321', 'final_expense_11307', 'final_expense_11303', 'final_expense_11301', 'final_expense_11300', 'final_expense_11296', 'final_expense_11295', 'final_expense_11294', 'final_expense_11293', 'final_expense_11267', 'final_expense_11264', 'final_expense_11262', 'final_expense_11249', 'final_expense_11246', 'final_expense_11240', 'final_expense_11233', 'final_expense_11223', 'final_expense_11218', 'final_expense_11217', 'final_expense_11216', 'final_expense_11204', 'final_expense_11166', 'final_expense_11163', 'final_expense_11128', 'final_expense_11127', 'final_expense_11111', 'final_expense_11082', 'final_expense_11057', 'final_expense_11027', 'final_expense_11026', 'final_expense_11022', 'final_expense_11741', 'final_expense_11831'];

    const order2OriginalLeads = ['final_expense_11559', 'final_expense_11557', 'final_expense_11556', 'final_expense_11551', 'final_expense_11550', 'final_expense_11549', 'final_expense_11544', 'final_expense_11543', 'final_expense_11539', 'final_expense_11533', 'final_expense_11531', 'final_expense_11530', 'final_expense_11524', 'final_expense_11522', 'final_expense_11521', 'final_expense_11520', 'final_expense_11518', 'final_expense_11513', 'final_expense_11512', 'final_expense_11508', 'final_expense_11223', 'final_expense_11218', 'final_expense_11217', 'final_expense_11216', 'final_expense_11204', 'final_expense_11166', 'final_expense_11163', 'final_expense_11128', 'final_expense_11127', 'final_expense_11111', 'final_expense_11082', 'final_expense_11057', 'final_expense_11027', 'final_expense_11026', 'final_expense_11022', 'final_expense_11741', 'final_expense_11831'];

    // Order 2 unique leads (not in order 1)
    const order1Set = new Set(order1Leads);
    const order2UniqueLeads = order2OriginalLeads.filter(id => !order1Set.has(id));
    console.log('Order 2 unique leads count:', order2UniqueLeads.length); // Should be 20

    // All leads already owned across orders 1 and 2 unique
    const alreadyOwned = new Set([...order1Leads, ...order2UniqueLeads]);
    console.log('Total already owned:', alreadyOwned.size);

    // ---- Fetch fresh leads from Google Sheets ----
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    // Get sheet names
    const sheetMetaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const sheetMeta = await sheetMetaResponse.json();
    const sheetMap = {};
    sheetMeta.sheets?.forEach(s => { sheetMap[s.properties.sheetId.toString()] = s.properties.title; });

    const FE_SHEET_ID = '387991684';
    const sheetName = sheetMap[FE_SHEET_ID];

    // Fetch entire final expense sheet to find 36 available leads not already owned
    const dataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A:Z`)}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const data = await dataResponse.json();
    const rows = data.values || [];
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Find available leads not already owned
    const newLeads = [];
    const newLeadIds = [];

    for (let i = 0; i < dataRows.length && newLeads.length < 36; i++) {
      const row = dataRows[i];
      const leadId = `final_expense_${i + 1}`;

      // Skip if already owned by this customer
      if (alreadyOwned.has(leadId)) continue;

      // Build lead object from row
      const lead = {};
      headers.forEach((header, j) => {
        const cleanHeader = header.trim().toLowerCase().replace(/\s+/g, '_');
        lead[cleanHeader] = row[j] || '';
      });

      // Check tier/status - need available tier
      const tier1 = (lead.tier_1 || '').trim().toLowerCase();
      const tier2 = (lead.tier_2 || '').trim().toLowerCase();
      const tier3 = (lead.tier_3 || '').trim().toLowerCase();
      const tier4 = (lead.tier_4 || '').trim().toLowerCase();
      const tier5 = (lead.tier_5 || '').trim().toLowerCase();

      const hasAvailableTier = [tier1, tier2, tier3, tier4, tier5].some(t => t === 'available');
      if (!hasAvailableTier) continue;

      // Calculate age_in_days
      let age_in_days = 0;
      if (lead.external_id) {
        const dateStr = lead.external_id.split('-')[0];
        if (dateStr.length === 8) {
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6)) - 1;
          const day = parseInt(dateStr.substring(6, 8));
          const uploadDate = new Date(year, month, day);
          if (!isNaN(uploadDate.getTime())) {
            age_in_days = Math.floor((Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
      }

      const cleanLead = {
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        email: lead.email || '',
        phone: lead.phone || '',
        date_of_birth: lead.date_of_birth || '',
        city: lead.city || '',
        state: lead.state || '',
        zip_code: lead.zip_code || '',
        type_of_coverage: lead.type_of_coverage || '',
        beneficiary: lead.beneficiary || '',
        favorite_hobby: lead.favorite_hobby || '',
        lead_id: leadId,
        lead_type: 'final_expense',
        age_in_days
      };

      // Only include if has actual data (first name not empty)
      if (!cleanLead.first_name) continue;

      newLeads.push(cleanLead);
      newLeadIds.push(leadId);
    }

    console.log('New leads found for order 3:', newLeads.length);

    if (newLeads.length < 36) {
      return Response.json({
        error: `Only found ${newLeads.length} available new leads, need 36`,
        success: false
      });
    }

    // ---- Fetch lead_data_snapshot for order 2 unique leads directly from sheets ----
    // Order 2 unique leads are all from final_expense sheet, extract row indices
    const leadTypeOrder = ['final_expense', 'veteran_life', 'retirement', 'annuity', 'recruiting', 'auto', 'home', 'health', 'life', 'medicare'];
    const rowIndices2 = order2UniqueLeads.map(id => {
      for (const type of leadTypeOrder) {
        if (id.startsWith(type + '_')) {
          const parts = id.split('_');
          const typeParts = type.split('_').length;
          return parseInt(parts[typeParts]);
        }
      }
      return null;
    }).filter(n => n !== null);

    const headerResponse2 = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A1:Z1`)}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const headerData2 = await headerResponse2.json();
    const feHeaders = headerData2.values?.[0] || [];

    const ranges2 = rowIndices2.map(rowIndex => {
      const rowNumber = rowIndex + 2;
      return `'${sheetName}'!A${rowNumber}:Z${rowNumber}`;
    });

    const batchResponse2 = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges2.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const batchData2 = await batchResponse2.json();
    const valueRanges2 = batchData2.valueRanges || [];

    const order2SnapshotLeads = [];
    for (let i = 0; i < rowIndices2.length; i++) {
      const rowIndex = rowIndices2[i];
      const row = valueRanges2[i]?.values?.[0];
      if (!row) continue;
      const lead = {};
      feHeaders.forEach((header, j) => {
        const cleanHeader = header.trim().toLowerCase().replace(/\s+/g, '_');
        lead[cleanHeader] = row[j] || '';
      });
      lead.lead_id = `final_expense_${rowIndex}`;
      lead.lead_type = 'final_expense';
      if (lead.external_id) {
        const dateStr = lead.external_id.split('-')[0];
        if (dateStr.length === 8) {
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6)) - 1;
          const day = parseInt(dateStr.substring(6, 8));
          const uploadDate = new Date(year, month, day);
          if (!isNaN(uploadDate.getTime())) {
            lead.age_in_days = Math.floor((Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
      }
      delete lead.external_id;
      delete lead.tier_1; delete lead.tier_2; delete lead.tier_3; delete lead.tier_4; delete lead.tier_5;
      order2SnapshotLeads.push(lead);
    }
    console.log('Order 2 snapshot leads fetched:', order2SnapshotLeads.length);

    // ---- Update Order 2: deduplicated to 20 unique leads ----
    await base44.asServiceRole.entities.Order.update(ORDER2_ID, {
      leads_purchased: order2UniqueLeads,
      lead_count: order2UniqueLeads.length,
      lead_data_snapshot: order2SnapshotLeads
    });
    console.log('Order 2 updated to', order2UniqueLeads.length, 'leads');

    // ---- Update Order 3: 36 fresh leads ----
    await base44.asServiceRole.entities.Order.update(ORDER3_ID, {
      leads_purchased: newLeadIds,
      lead_count: newLeadIds.length,
      lead_data_snapshot: newLeads
    });
    console.log('Order 3 updated to', newLeads.length, 'fresh leads');

    return Response.json({
      success: true,
      order2: {
        id: ORDER2_ID,
        lead_count: order2UniqueLeads.length,
        leads_purchased: order2UniqueLeads
      },
      order3: {
        id: ORDER3_ID,
        lead_count: newLeads.length,
        sample_leads: newLeads.slice(0, 3).map(l => ({ lead_id: l.lead_id, first_name: l.first_name, state: l.state }))
      }
    });

  } catch (error) {
    console.error('Error fixing orders:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});