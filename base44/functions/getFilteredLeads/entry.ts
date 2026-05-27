import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
  return res.json();
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filters = {}, user_email } = await req.json();

    // Build Supabase query params
    const params = new URLSearchParams();

    // Select all columns
    params.append('select', '*');

    // Lead type filter — Supabase stores as title-case (e.g. "Final Expense"), 
    // app uses snake_case (e.g. "final_expense"). Use ilike for flexibility.
    if (filters.lead_type && filters.lead_type !== 'all') {
      const readable = filters.lead_type.replace(/_/g, ' ');
      params.append('lead_type', `ilike.${readable}`);
    }

    // State filter (single or multiple)
    if (filters.states && filters.states.length > 0) {
      params.append('state', `in.(${filters.states.join(',')})`);
    } else if (filters.state && filters.state !== 'all') {
      params.append('state', `eq.${filters.state}`);
    }

    // Supabase default page size is 1000 — set a high limit
    params.append('limit', '20000');

    // Supabase enforces a 1000-row page size by default — paginate until we have all rows
    const PAGE_SIZE = 1000;
    let leads = [];
    let offset = 0;
    while (true) {
      const pageParams = new URLSearchParams(params);
      pageParams.set('limit', String(PAGE_SIZE));
      pageParams.set('offset', String(offset));
      const page = await supabase(`aged_leads?${pageParams.toString()}`);
      leads = leads.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    console.log(`Fetched ${leads.length} leads from Supabase`);

    // Build suppression set (already-sold lead IDs globally + customer's own purchases)
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));

    if (user_email) {
      const customers = await base44.asServiceRole.entities.Customer.filter({ email: user_email });
      const customer = customers[0];
      if (customer?.is_blocked) {
        console.warn(`Blocked customer attempted to browse leads: ${user_email}`);
        return Response.json({ leads: [], total: 0, blocked: true });
      }

      const customerOrders = await base44.asServiceRole.entities.Order.filter({ customer_email: user_email, status: 'completed' });
      for (const order of customerOrders) {
        for (const lid of (order.leads_purchased || [])) {
          soldLeadIds.add(lid);
        }
      }
    }

    // Process and filter leads
    let filtered = leads
      .filter(lead => !soldLeadIds.has(lead.id))
      .map(lead => {
        // Calculate age_in_days from external_id (format: YYYYMMDD-...)
        let age_in_days = 0;
        if (lead.external_id) {
          const dateStr = lead.external_id.split('-')[0];
          if (dateStr.length === 8) {
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1;
            const day = parseInt(dateStr.substring(6, 8));
            const uploadDate = new Date(year, month, day);
            if (!isNaN(uploadDate.getTime())) {
              age_in_days = Math.floor((Date.now() - uploadDate) / (1000 * 60 * 60 * 24));
            }
          }
        }

        // Determine tier availability — a lead is "browsable" if at least one tier is still unsold
        const anyTierAvailable = !lead.tier_1_sold || !lead.tier_2_sold || !lead.tier_3_sold || !lead.tier_4_sold || !lead.tier_5_sold;
        if (!anyTierAvailable) return null;

        // Obscure last name for browsing
        const last_name_initial = lead.last_name ? String(lead.last_name).charAt(0).toUpperCase() : '';

        return {
          id: lead.id,
          external_id: lead.external_id,
          first_name: lead.first_name,
          last_name_initial,
          email: lead.email,
          phone: lead.phone,
          date_of_birth: lead.date_of_birth,
          city: lead.city,
          state: lead.state,
          zip_code: lead.zip_code,
          lead_type: lead.lead_type?.toLowerCase().replace(/\s+/g, '_'),
          age_in_days,
          // Spread custom_data fields for UI compatibility
          ...(lead.custom_data || {}),
          tier_1_sold: lead.tier_1_sold,
          tier_2_sold: lead.tier_2_sold,
          tier_3_sold: lead.tier_3_sold,
          tier_4_sold: lead.tier_4_sold,
          tier_5_sold: lead.tier_5_sold,
        };
      })
      .filter(Boolean);

    console.log(`After suppression filter: ${filtered.length}`);

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

    // Zip code / distance filter
    if (filters.zip_code) {
      const normalizeZip = (zip) => String(zip).padStart(5, '0');
      const normalizedSearchZip = normalizeZip(filters.zip_code);

      if (filters.distance) {
        const distance = parseFloat(filters.distance);

        const getZipCoordinates = async (zipCode) => {
          const cached = await base44.asServiceRole.entities.ZipCode.filter({ zip_code: zipCode });
          if (cached.length > 0) return { latitude: cached[0].latitude, longitude: cached[0].longitude };
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?postalcode=${zipCode}&country=US&format=json&limit=1`,
            { headers: { 'User-Agent': 'YesterdaysLeads/1.0' } }
          );
          if (!res.ok) return null;
          const results = await res.json();
          if (!results.length) return null;
          const coords = { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon) };
          base44.asServiceRole.entities.ZipCode.create({ zip_code: zipCode, ...coords, city: results[0].display_name?.split(',')[0] || '', state: '' }).catch(() => {});
          return coords;
        };

        const searchCoords = await getZipCoordinates(normalizedSearchZip);
        if (!searchCoords) {
          filtered = [];
        } else {
          const { latitude: lat1, longitude: lon1 } = searchCoords;
          const cachedZips = await base44.asServiceRole.entities.ZipCode.list('', 50000);
          const zipMap = new Map(cachedZips.map(z => [normalizeZip(z.zip_code), z]));

          const missingZips = [...new Set(filtered.map(l => normalizeZip(l.zip_code)).filter(z => !zipMap.has(z)))].slice(0, 5);
          for (const zipCode of missingZips) {
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${zipCode}&country=US&format=json&limit=1`, { headers: { 'User-Agent': 'YesterdaysLeads/1.0' } });
              if (res.ok) {
                const results = await res.json();
                if (results.length) {
                  const coords = { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon) };
                  zipMap.set(zipCode, coords);
                  base44.asServiceRole.entities.ZipCode.create({ zip_code: zipCode, ...coords, city: results[0].display_name?.split(',')[0] || '', state: '' }).catch(() => {});
                }
              }
              await new Promise(r => setTimeout(r, 1100));
            } catch (e) { console.error(`Zip lookup failed for ${zipCode}:`, e.message); }
          }

          const haversine = (lat1, lon1, lat2, lon2) => {
            const R = 3959, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          };

          filtered = filtered.filter(lead => {
            const z = normalizeZip(lead.zip_code);
            if (z === normalizedSearchZip) return true;
            const zd = zipMap.get(z);
            if (!zd) return false;
            return haversine(lat1, lon1, zd.latitude, zd.longitude) <= distance;
          });
        }
      } else {
        filtered = filtered.filter(lead => {
          const z = normalizeZip(lead.zip_code);
          return z === normalizedSearchZip || z.startsWith(normalizedSearchZip);
        });
      }
    }

    console.log(`Returning ${filtered.length} filtered leads`);
    return Response.json({ leads: filtered, total: filtered.length });

  } catch (error) {
    console.error('Filter error:', error);
    return Response.json({ error: error.message, leads: [] }, { status: 500 });
  }
});