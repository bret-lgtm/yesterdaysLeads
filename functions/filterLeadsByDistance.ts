import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { search_zip, distance, leads } = await req.json();

    if (!search_zip || !distance || !leads) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const normalizeZip = (zip) => String(zip).padStart(5, '0');
    const normalizedSearchZip = normalizeZip(search_zip);

    // Fetch search zip coordinates
    const searchZipResults = await base44.asServiceRole.entities.ZipCode.filter({ 
      zip_code: normalizedSearchZip 
    });

    if (searchZipResults.length === 0) {
      return Response.json({ 
        filtered_leads: leads.filter(lead => normalizeZip(lead.zip_code || '') === normalizedSearchZip)
      });
    }

    const searchZipData = searchZipResults[0].data || searchZipResults[0];
    const { latitude: lat1, longitude: lon1 } = searchZipData;

    // Get unique zip codes from leads
    const uniqueZips = [...new Set(leads.map(l => normalizeZip(l.zip_code || '')).filter(Boolean))];

    // Fetch all zip codes at once (up to 50k limit)
    const allZipCodes = await base44.asServiceRole.entities.ZipCode.list('', 50000);
    
    // Build a map for fast lookups
    const zipDataMap = new Map();
    allZipCodes.forEach(result => {
      const data = result.data || result;
      if (data.zip_code) {
        zipDataMap.set(normalizeZip(data.zip_code), data);
      }
    });

    // Haversine distance calculation
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 3959; // Earth radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Filter leads by distance
    const filtered = leads.filter(lead => {
      if (!lead.zip_code) return false;
      
      const normalizedLeadZip = normalizeZip(lead.zip_code);
      if (normalizedLeadZip === normalizedSearchZip) return true;

      const leadZipData = zipDataMap.get(normalizedLeadZip);
      if (!leadZipData) return false;

      const dist = calculateDistance(lat1, lon1, leadZipData.latitude, leadZipData.longitude);
      return dist <= parseFloat(distance);
    });

    return Response.json({ filtered_leads: filtered });
  } catch (error) {
    console.error('Distance filter error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});