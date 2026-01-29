import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('🔵 Function called');
  try {
    console.log('🟢 Inside try block');
    const base44 = createClientFromRequest(req);
    console.log('🟡 Base44 client created');
    const { filters = {} } = await req.json();
    console.log('🟣 Filters:', JSON.stringify(filters));

    // Get access token for Google Sheets
    console.log('⏳ Getting access token...');
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
    console.log('✅ Access token received');
    
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
    console.log('📄 Spreadsheet ID:', spreadsheetId ? 'Set' : 'NOT SET');
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
      final_expense: '0'
    };

    let allLeads = [];

    // Determine which sheets to query
    const sheetsToQuery = filters.lead_type && filters.lead_type !== 'all'
      ? [filters.lead_type]
      : Object.keys(sheetIds);

    // First, get sheet names from metadata
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
      console.error('Failed to fetch sheet metadata:', await sheetMetaResponse.text());
      return Response.json({ success: false, error: 'Failed to fetch sheet metadata', leads: [] });
    }
    
    const sheetMeta = await sheetMetaResponse.json();
    console.log('📑 Sheet metadata fetched, sheets count:', sheetMeta.sheets?.length || 0);
    
    const sheetMap = {};
    sheetMeta.sheets?.forEach(sheet => {
      const id = sheet.properties.sheetId.toString();
      sheetMap[id] = sheet.properties.title;
    });
    console.log('🗺️ Sheet map:', JSON.stringify(sheetMap));

    // Fetch data from each sheet
    for (const leadType of sheetsToQuery) {
      try {
        const sheetId = sheetIds[leadType];
        const sheetName = sheetMap[sheetId];
        
        console.log(`Processing ${leadType}: sheetId=${sheetId}, sheetName=${sheetName}`);
        
        if (!sheetName) {
          console.log(`❌ No sheet name found for ${leadType}`);
          continue;
        }
      
      const range = `'${sheetName}'!A:M`;
      
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
        console.error(`Failed to fetch ${leadType} (${sheetName}):`, await response.text());
        continue;
      }

      const data = await response.json();
      const rows = data.values || [];

      if (rows.length < 2) {
        continue; // Skip if no data rows
      }

      // First row is headers
      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      // Log headers for Life sheet
      if (leadType === 'life') {
        console.log(`🔍 Life sheet headers:`, headers);
        console.log(`🔍 Life sheet header count:`, headers.length);
      }

      // Convert rows to objects
      const leads = dataRows.map((row, index) => {
        const lead = {};
        headers.forEach((header, i) => {
          // Clean header: trim, lowercase, replace spaces with underscores
          const cleanHeader = header.trim().toLowerCase().replace(/\s+/g, '_');
          lead[cleanHeader] = row[i] || '';
        });
        
        // Add required fields
        lead.id = `${leadType}_${index}`;
        lead.lead_type = leadType;
        
        return lead;
      });
      
      // Log sample lead for Life sheet
      if (leadType === 'life' && leads.length > 0) {
        console.log(`🔍 Sample Life lead:`, JSON.stringify(leads[0]));
        console.log(`🔍 Life lead status value:`, `"${leads[0].status}"`);
      }

      allLeads = allLeads.concat(leads);
      } catch (error) {
        console.error(`❌ Error processing ${leadType}:`, error.message);
      }
    }

    // Apply filters - only show leads with exact status "Available"
    console.log('📊 Total leads before filtering:', allLeads.length);
    if (allLeads.length > 0) {
      console.log('📋 Sample lead:', JSON.stringify(allLeads[0]));
      console.log('📋 All unique statuses:', [...new Set(allLeads.map(l => `"${l.status}"`))].join(', '));
    }
    
    let filteredLeads = allLeads.filter(lead => {
      const statusMatch = lead.status && lead.status.trim().toLowerCase() === 'available';
      return statusMatch;
    });
    
    console.log('✅ Leads after status filter:', filteredLeads.length);

    if (filters.state && filters.state !== 'all') {
      filteredLeads = filteredLeads.filter(lead => lead.state === filters.state);
    }

    if (filters.zip_code) {
      filteredLeads = filteredLeads.filter(lead => 
        lead.zip_code && lead.zip_code.startsWith(filters.zip_code)
      );
    }

    if (filters.age_range && filters.age_range !== 'all') {
      filteredLeads = filteredLeads.filter(lead => {
        if (!lead.external_id) return false;
        
        // Parse date from external_id format: YYYYMMDD-TYPE-###
        const dateStr = lead.external_id.split('-')[0];
        if (dateStr.length !== 8) return false;
        
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const uploadDate = new Date(year, month, day);
        
        // Validate the date
        if (isNaN(uploadDate.getTime())) return false;
        
        const now = new Date();
        const hoursSinceUpload = (now - uploadDate) / (1000 * 60 * 60);
        const ageInDays = Math.floor(hoursSinceUpload / 24);
        
        if (filters.age_range === 'yesterday') {
          return hoursSinceUpload <= 72;
        } else if (filters.age_range === '4-14') {
          return ageInDays >= 4 && ageInDays <= 14;
        } else if (filters.age_range === '15-30') {
          return ageInDays >= 15 && ageInDays <= 30;
        } else if (filters.age_range === '31-90') {
          return ageInDays >= 31 && ageInDays <= 90;
        } else if (filters.age_range === '91+') {
          return ageInDays >= 91;
        }
        
        return true;
      });
    }

    return Response.json({
      success: true,
      leads: filteredLeads,
      total: filteredLeads.length
    });

  } catch (error) {
    console.error('Error fetching leads from sheets:', error);
    return Response.json({
      success: false,
      error: error.message,
      leads: []
    }, { status: 500 });
  }
});