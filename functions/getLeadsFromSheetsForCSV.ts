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

    // Get access token for Google Sheets
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
    
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    if (!spreadsheetId) {
      return Response.json({ 
        success: false, 
        error: 'GOOGLE_SHEET_ID not configured',
        leads: [] 
      });
    }

    // Map lead types to sheet IDs (gid)
    const sheetIds = {
      auto: '44023422',
      home: '1745292620',
      health: '1305861843',
      life: '113648240',
      medicare: '757044649',
      final_expense: '387991684',
      veteran_life: '1401332567'
    };

    let allLeads = [];

    // Extract unique lead types from lead IDs
    const leadTypeOrder = ['final_expense', 'veteran_life', 'auto', 'home', 'health', 'life', 'medicare'];
    const sheetsToQuery = [...new Set(lead_ids.map(id => {
      for (const type of leadTypeOrder) {
        if (id.startsWith(type + '_')) return type;
      }
      return null;
    }).filter(Boolean))];
    console.log('Extracted lead types:', sheetsToQuery);

    // Get sheet names from metadata
    const sheetMetaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!sheetMetaResponse.ok) {
      return Response.json({ success: false, error: 'Failed to fetch sheet metadata', leads: [] });
    }
    
    const sheetMeta = await sheetMetaResponse.json();
    const sheetMap = {};
    sheetMeta.sheets?.forEach(sheet => {
      const id = sheet.properties.sheetId.toString();
      sheetMap[id] = sheet.properties.title;
    });
    console.log('Sheet map:', JSON.stringify(sheetMap));
    console.log('Sheets to query:', sheetsToQuery);

    // Fetch data from each sheet
    for (const leadType of sheetsToQuery) {
      try {
        const sheetId = sheetIds[leadType];
        const sheetName = sheetMap[sheetId];
        
        console.log(`Processing ${leadType}: sheetId=${sheetId}, sheetName=${sheetName}`);
        
        if (!sheetName) {
          console.log(`No sheet name found for ${leadType}`);
          continue;
        }
      
        const range = `'${sheetName}'!A:Z`;
      
        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const rows = data.values || [];

        if (rows.length < 2) {
          continue;
        }

        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Convert rows to objects
        const leads = dataRows.map((row, index) => {
          const lead = {};
          headers.forEach((header, i) => {
            const cleanHeader = header.trim().toLowerCase().replace(/\s+/g, '_');
            lead[cleanHeader] = row[i] || '';
          });

          lead.id = `${leadType}_${index}`;
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
                const hoursSinceUpload = (now - uploadDate) / (1000 * 60 * 60);
                lead.age_in_days = Math.floor(hoursSinceUpload / 24);
              }
            }
          }

          // Remove external_id and tier fields
          delete lead.external_id;
          delete lead.tier_1;
          delete lead.tier_2;
          delete lead.tier_3;
          delete lead.tier_4;
          delete lead.tier_5;

          return lead;
        });

        allLeads = allLeads.concat(leads);
      } catch (error) {
        console.error(`Error processing ${leadType}:`, error.message);
      }
    }

    // Filter to only requested lead IDs
    const filteredLeads = allLeads.filter(lead => lead_ids.includes(lead.id));

    return Response.json({
      success: true,
      leads: filteredLeads,
      total: filteredLeads.length
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