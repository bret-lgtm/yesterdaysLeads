import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { lead_ids = [] } = await req.json();

    if (!lead_ids || lead_ids.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'No lead IDs provided',
        leads: [] 
      });
    }

    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, error: 'GOOGLE_API_KEY not configured', leads: [] });
    }
    
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    if (!spreadsheetId) {
      return Response.json({ success: false, error: 'GOOGLE_SHEET_ID not configured', leads: [] });
    }

    const sheetIds = {
      auto: '44023422',
      home: '1745292620',
      health: '1305861843',
      life: '113648240',
      medicare: '757044649',
      final_expense: '387991684',
      veteran_life: '1401332567',
      retirement: '712013125',
      annuity: '409761548',
      recruiting: '1894668336'
    };

    const sheetMap = {
      '44023422': 'Auto Leads',
      '113648240': 'Life Leads',
      '387991684': 'Final Expense Leads',
      '409761548': 'Annuity Leads',
      '712013125': 'Retirement Leads',
      '757044649': 'Medicare Leads',
      '1305861843': 'Health Leads',
      '1401332567': 'Veteran Life Leads',
      '1745292620': 'Home Leads',
      '1894668336': 'Recruiting Leads'
    };

    const leadTypeOrder = ['final_expense', 'veteran_life', 'retirement', 'annuity', 'recruiting', 'medicare', 'health', 'home', 'auto', 'life'];

    // Deduplicate lead IDs
    const uniqueLeadIds = [...new Set(lead_ids)];
    console.log('Fetching leads for CSV:', uniqueLeadIds.length);

    // Group lead_ids by lead type and row index
    const leadsByType = {};
    uniqueLeadIds.forEach(id => {
      for (const type of leadTypeOrder) {
        if (id.startsWith(type + '_')) {
          const parts = id.split('_');
          const typeParts = type.split('_').length;
          const rowIndex = parseInt(parts[typeParts]);
          if (!leadsByType[type]) leadsByType[type] = [];
          leadsByType[type].push(rowIndex);
          break;
        }
      }
    });

    let allLeads = [];

    for (const [leadType, rowIndices] of Object.entries(leadsByType)) {
      try {
        const sheetId = sheetIds[leadType];
        const sheetName = sheetMap[sheetId];
        if (!sheetName) continue;

        // Get header row
        const headerResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A1:Z1`)}?key=${apiKey}`
        );

        if (!headerResponse.ok) {
          console.error(`Header fetch failed for ${leadType}:`, await headerResponse.text());
          continue;
        }
        const headerData = await headerResponse.json();
        const headers = headerData.values?.[0] || [];

        // Batch fetch specific rows
        const uniqueRowIndices = [...new Set(rowIndices)];
        const ranges = uniqueRowIndices.map(rowIndex => `'${sheetName}'!A${rowIndex + 2}:Z${rowIndex + 2}`);

        const batchResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}&key=${apiKey}`
        );

        if (!batchResponse.ok) {
          console.error(`Batch fetch failed for ${leadType}:`, await batchResponse.text());
          continue;
        }
        const batchData = await batchResponse.json();
        const valueRanges = batchData.valueRanges || [];

        for (let i = 0; i < uniqueRowIndices.length; i++) {
          const rowIndex = uniqueRowIndices[i];
          const row = valueRanges[i]?.values?.[0];
          if (!row) continue;

          const lead = {};
          headers.forEach((header, j) => {
            const cleanHeader = header.trim().toLowerCase().replace(/\s+/g, '_');
            lead[cleanHeader] = row[j] || '';
          });

          lead.lead_id = `${leadType}_${rowIndex}`;
          lead.lead_type = leadType;

          // Calculate age_in_days from external_id
          if (lead.external_id) {
            const dateStr = lead.external_id.split('-')[0];
            if (dateStr.length === 8) {
              const year = parseInt(dateStr.substring(0, 4));
              const month = parseInt(dateStr.substring(4, 6)) - 1;
              const day = parseInt(dateStr.substring(6, 8));
              const uploadDate = new Date(year, month, day);
              if (!isNaN(uploadDate.getTime())) {
                const now = new Date();
                lead.age_in_days = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24));
              }
            }
          }

          delete lead.tier_1;
          delete lead.tier_2;
          delete lead.tier_3;
          delete lead.tier_4;
          delete lead.tier_5;

          allLeads.push(lead);
        }
      } catch (error) {
        console.error(`Error processing ${leadType}:`, error.message);
      }
    }

    return Response.json({
      success: true,
      leads: allLeads,
      total: allLeads.length
    });

  } catch (error) {
    console.error('CSV fetch error:', error);
    return Response.json({
      success: false,
      error: error.message,
      leads: []
    }, { status: 500 });
  }
});