import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { filters } = await req.json();

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
    const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');

    // Map sheet IDs to lead types
    const sheetMapping = {
      '0': 'final_expense',
      '1881938138': 'life',
      '1409619233': 'veteran_life',
      '1726390815': 'retirement',
      '903542062': 'home',
      '1220733885': 'auto',
      '2103821275': 'medicare',
      '1114869743': 'health'
    };

    // Determine which sheets to fetch
    const targetTypes = filters.lead_type && filters.lead_type !== 'all' 
      ? [filters.lead_type] 
      : Object.values(sheetMapping);

    const sheetsToFetch = Object.entries(sheetMapping)
      .filter(([_, type]) => targetTypes.includes(type))
      .map(([id, _]) => id);

    // Fetch sheet metadata to get names
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const metadata = await metadataResponse.json();
    const sheetIdToTitle = {};
    metadata.sheets.forEach(sheet => {
      sheetIdToTitle[sheet.properties.sheetId] = sheet.properties.title;
    });

    // Fetch all leads
    let allLeads = [];
    for (const sheetId of sheetsToFetch) {
      const sheetName = sheetIdToTitle[sheetId];
      if (!sheetName) continue;

      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const data = await response.json();

      if (!data.values || data.values.length < 2) continue;

      const headers = data.values[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const rows = data.values.slice(1);

      rows.forEach(row => {
        const lead = {};
        headers.forEach((header, idx) => {
          lead[header] = row[idx] || '';
        });

        if (lead.status?.toLowerCase() !== 'available') return;

        const uploadDate = new Date(lead.upload_date || lead.date_uploaded);
        const ageInDays = Math.floor((Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));

        allLeads.push({
          id: lead.lead_id || lead.id,
          external_id: lead.lead_id || lead.id,
          lead_type: sheetMapping[sheetId],
          first_name: lead.first_name,
          last_name: lead.last_name,
          last_name_initial: lead.last_name_initial,
          phone: lead.phone,
          email: lead.email,
          state: lead.state,
          zip_code: lead.zip_code,
          utility_bill_amount: parseFloat(lead.utility_bill_amount) || 0,
          upload_date: lead.upload_date || lead.date_uploaded,
          age_in_days: ageInDays,
          status: 'available'
        });
      });
    }

    // Apply filters
    let filtered = allLeads;

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
          const searchZipData = searchZipResults[0].data || searchZipResults[0];
          const { latitude: lat1, longitude: lon1 } = searchZipData;
          const distance = parseFloat(filters.distance);

          // Load all zip codes once
          const allZipCodes = await base44.asServiceRole.entities.ZipCode.list('', 50000);
          const zipMap = new Map();
          allZipCodes.forEach(result => {
            const data = result.data || result;
            if (data.zip_code) {
              zipMap.set(normalizeZip(data.zip_code), data);
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});