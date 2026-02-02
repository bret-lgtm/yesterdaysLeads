import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { filters = {} } = await req.json();

    // Get access token for Google Sheets
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    if (!spreadsheetId) {
      return Response.json({ leads: [], error: 'GOOGLE_SHEET_ID not configured' });
    }

    // Map lead types to sheet IDs (gid) - MUST match getLeadsFromSheets
    const sheetIds = {
      auto: '44023422',
      home: '1745292620',
      health: '1305861843',
      life: '113648240',
      medicare: '757044649',
      final_expense: '387991684',
      veteran_life: '1401332567',
      retirement: '712013125'
    };

    // Determine which sheets to query
    const sheetsToQuery = filters.lead_type && filters.lead_type !== 'all'
      ? [filters.lead_type]
      : Object.keys(sheetIds);

    // Fetch sheet metadata to get names
    const sheetMetaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    const sheetMeta = await sheetMetaResponse.json();
    const sheetMap = {};
    sheetMeta.sheets?.forEach(sheet => {
      const id = sheet.properties.sheetId.toString();
      sheetMap[id] = sheet.properties.title;
    });

    // Fetch data from each sheet
    let allLeads = [];
    for (const leadType of sheetsToQuery) {
      const sheetId = sheetIds[leadType];
      const sheetName = sheetMap[sheetId];
      
      if (!sheetName) continue;
    
      const range = `'${sheetName}'!A:Z`;
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const rows = data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0];
      const dataRows = rows.slice(1);

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
        
        // Remove last name for security
        if (lead.last_name) {
          lead.last_name_initial = lead.last_name.charAt(0).toUpperCase();
          delete lead.last_name;
        }
        
        return lead;
      });

      allLeads = allLeads.concat(leads);
    }

    // Filter by status
    let filtered = allLeads.filter(lead => {
      if (!lead.status || lead.status === 'undefined') return true;
      return lead.status.trim().toLowerCase() === 'available';
    });

    // State filter
    if (filters.state && filters.state !== 'all') {
      filtered = filtered.filter(lead => lead.state === filters.state);
    }

    // Age range filter
    if (filters.age_range && filters.age_range !== 'all') {
      filtered = filtered.filter(lead => {
        const age = lead.age_in_days || 0;
        if (filters.age_range === 'yesterday') return age <= 3;
        if (filters.age_range === '4-14') return age >= 4 && age <= 14;
        if (filters.age_range === '15-30') return age >= 15 && age <= 30;
        if (filters.age_range === '31-90') return age >= 31 && age <= 90;
        if (filters.age_range === '91+') return age >= 91;
        return true;
      });
    }

    // Zip code and distance filter
    if (filters.zip_code) {
      const normalizeZip = (zip) => String(zip).padStart(5, '0');
      const normalizedSearchZip = normalizeZip(filters.zip_code);

      if (filters.distance) {
        // Distance-based search
        const searchZipResults = await base44.asServiceRole.entities.ZipCode.filter({ 
          zip_code: normalizedSearchZip 
        });

        if (searchZipResults.length > 0) {
          const searchZipData = searchZipResults[0];
          const { latitude: lat1, longitude: lon1 } = searchZipData;
          const distance = parseFloat(filters.distance);

          // Load all zip codes once
          const allZipCodes = await base44.asServiceRole.entities.ZipCode.list('', 50000);
          const zipMap = new Map();
          allZipCodes.forEach(zipCode => {
            if (zipCode.zip_code) {
              zipMap.set(normalizeZip(zipCode.zip_code), zipCode);
            }
          });

          // Haversine distance
          const calculateDistance = (lat1, lon1, lat2, lon2) => {
            const R = 3959;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
          };

          filtered = filtered.filter(lead => {
            if (!lead.zip_code) return false;
            const normalizedLeadZip = normalizeZip(lead.zip_code);
            if (normalizedLeadZip === normalizedSearchZip) return true;

            const leadZipData = zipMap.get(normalizedLeadZip);
            if (!leadZipData) return false;

            const dist = calculateDistance(lat1, lon1, leadZipData.latitude, leadZipData.longitude);
            return dist <= distance;
          });
        } else {
          // Search zip not found, exact match only
          filtered = filtered.filter(lead => normalizeZip(lead.zip_code || '') === normalizedSearchZip);
        }
      } else {
        // Just zip code filter, no distance
        filtered = filtered.filter(lead => 
          lead.zip_code && (normalizeZip(lead.zip_code) === normalizedSearchZip || normalizeZip(lead.zip_code).startsWith(normalizedSearchZip))
        );
      }
    }

    return Response.json({ leads: filtered });
  } catch (error) {
    console.error('Filter error:', error);
    return Response.json({ error: error.message, leads: [] }, { status: 500 });
  }
});