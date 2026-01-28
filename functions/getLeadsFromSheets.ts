import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { filters = {} } = await req.json();

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

    // Map lead types to sheet names
    const sheetNames = {
      auto: 'Auto Leads',
      home: 'Home Leads',
      health: 'Health Leads',
      life: 'Life Leads',
      medicare: 'Medicare Leads',
      final_expense: 'Final Expense Leads'
    };

    let allLeads = [];

    // Determine which sheets to query
    const sheetsToQuery = filters.lead_type && filters.lead_type !== 'all'
      ? [filters.lead_type]
      : Object.keys(sheetNames);

    // Fetch data from each sheet
    for (const leadType of sheetsToQuery) {
      const sheetName = sheetNames[leadType];
      const range = `${sheetName}!A:M`; // Extended to accommodate all columns

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
        console.error(`Failed to fetch ${sheetName}:`, await response.text());
        continue;
      }

      const data = await response.json();
      const rows = data.values || [];

      if (rows.length < 2) continue; // Skip if no data rows

      // First row is headers
      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Convert rows to objects
      const leads = dataRows.map((row, index) => {
        const lead = {};
        headers.forEach((header, i) => {
          lead[header.toLowerCase().replace(/\s+/g, '_')] = row[i] || '';
        });
        
        // Add required fields
        lead.id = `${leadType}_${index}`;
        lead.lead_type = leadType;
        
        // Parse numeric fields
        if (lead.utility_bill_amount) {
          lead.utility_bill_amount = parseFloat(lead.utility_bill_amount);
        }
        
        return lead;
      });

      allLeads = allLeads.concat(leads);
    }

    // Apply filters - only show leads with exact status "Available"
    let filteredLeads = allLeads.filter(lead => lead.status === 'Available');

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
        if (!lead.upload_date) return false;
        
        const uploadDate = new Date(lead.upload_date);
        const now = new Date();
        
        if (filters.age_range === 'yesterday') {
          const hoursSinceUpload = (now - uploadDate) / (1000 * 60 * 60);
          return hoursSinceUpload <= 24;
        }
        
        const ageInDays = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24));
        const [min, max] = filters.age_range.includes('+')
          ? [parseInt(filters.age_range), Infinity]
          : filters.age_range.split('-').map(Number);
        
        return ageInDays >= min && ageInDays <= max;
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