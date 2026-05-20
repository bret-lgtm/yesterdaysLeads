import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('🔵 Function called');
  try {
    console.log('🟢 Inside try block');
    const base44 = createClientFromRequest(req);
    console.log('🟡 Base44 client created');
    const { filters = {}, include_last_names = false, lead_ids = [] } = await req.json();
    console.log('🟣 Filters:', JSON.stringify(filters));
    console.log('🔐 Include last names:', include_last_names);

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
      final_expense: '387991684',
      veteran_life: '1401332567',
      retirement: '712013125',
      annuity: '409761548',
      recruiting: '1894668336'
    };

    let allLeads = [];

    // Determine which sheets to query
    let sheetsToQuery;
    if (lead_ids && lead_ids.length > 0) {
      // If looking for specific lead IDs, extract lead types from IDs
      sheetsToQuery = [...new Set(lead_ids.map(id => id.split('_')[0]))];
    } else {
      sheetsToQuery = filters.lead_type && filters.lead_type !== 'all'
        ? [filters.lead_type]
        : Object.keys(sheetIds);
    }

    // Helper: fetch with retry on 429
    async function fetchWithRetry(url, options, maxRetries = 3) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, options);
        if (res.status !== 429) return res;
        const waitMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`Rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
      // Final attempt
      return fetch(url, options);
    }

    // Use hardcoded sheet name map to avoid metadata API call (saves quota)
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
    console.log('🗺️ Using hardcoded sheet map (no metadata API call needed)');

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
      
      const range = `'${sheetName}'!A:Z`;
      
      const response = await fetchWithRetry(
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
        
        // Remove last name for security unless explicitly requested
        if (!include_last_names && lead.last_name) {
          lead.last_name_initial = lead.last_name.charAt(0).toUpperCase();
          delete lead.last_name;
        }
        
        return lead;
      });
      
      // Log sample lead for specific sheets
      if (leadType === 'life' && leads.length > 0) {
        console.log(`🔍 Sample Life lead:`, JSON.stringify(leads[0]));
        console.log(`🔍 Life lead status value:`, `"${leads[0].status}"`);
        console.log(`🔍 Life lead age_in_days:`, leads[0].age_in_days);
      }
      if (leadType === 'medicare') {
        console.log(`🔍 Medicare total leads before filtering:`, leads.length);
        const statusCounts = {};
        leads.forEach(lead => {
          const status = lead.status || 'undefined';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        console.log(`🔍 Medicare status breakdown:`, JSON.stringify(statusCounts));
      }
      if (leadType === 'auto' && leads.length > 0) {
        console.log(`🔍 Sample Auto lead age_in_days:`, leads[0].age_in_days);
      }

      allLeads = allLeads.concat(leads);
      } catch (error) {
        console.error(`❌ Error processing ${leadType}:`, error.message);
      }
    }

    // Fetch all sold lead IDs from LeadSuppression to exclude them
    let soldLeadIds = new Set();
    if (!lead_ids || lead_ids.length === 0) {
      // Only needed when browsing - not when fetching specific IDs for CSV
      const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
      soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));
      console.log(`Sold lead IDs (suppression list): ${soldLeadIds.size}`);
    }

    // Apply status filtering only - if no status column exists, treat all leads as available
    let filteredLeads = allLeads;

    // If specific lead IDs were requested, filter to only those
    if (lead_ids && lead_ids.length > 0) {
      filteredLeads = allLeads.filter(lead => lead_ids.includes(lead.id));
    } else {
      // Filter by status AND suppression list
      filteredLeads = allLeads.filter(lead => {
        if (soldLeadIds.has(lead.id)) return false;
        if (!lead.status || lead.status === 'undefined') return true;
        return lead.status.trim().toLowerCase() === 'available';
      });
    }

    return Response.json({
      success: true,
      leads: filteredLeads,
      total: filteredLeads.length
    });

  } catch (error) {
    console.error('❌❌❌ CAUGHT ERROR:', error);
    console.error('❌❌❌ Error message:', error.message);
    console.error('❌❌❌ Error stack:', error.stack);
    return Response.json({
      success: false,
      error: error.message,
      leads: []
    }, { status: 500 });
  }
});