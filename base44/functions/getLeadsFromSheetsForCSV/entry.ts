import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    createClientFromRequest(req); // auth context

    const { lead_ids = [] } = await req.json();

    if (!lead_ids || lead_ids.length === 0) {
      return Response.json({ success: false, error: 'No lead IDs provided', leads: [] });
    }

    const uniqueLeadIds = [...new Set(lead_ids)];
    console.log('Fetching leads for CSV from Supabase:', uniqueLeadIds.length);

    // Fetch in batches of 200 to avoid URL length limits
    const BATCH_SIZE = 200;
    let allLeads = [];

    for (let i = 0; i < uniqueLeadIds.length; i += BATCH_SIZE) {
      const batch = uniqueLeadIds.slice(i, i + BATCH_SIZE);
      const idList = batch.map(id => `"${id}"`).join(',');

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/aged_leads?id=in.(${idList})&select=*`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error('Supabase fetch error:', text);
        continue;
      }

      const rows = await res.json();
      allLeads = allLeads.concat(rows);
    }

    // Format leads for CSV — flatten custom_data and calculate age_in_days
    const formattedLeads = allLeads.map(lead => {
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

      const { custom_data, tier_1_sold, tier_2_sold, tier_3_sold, tier_4_sold, tier_5_sold, created_at, ...coreFields } = lead;

      return {
        ...coreFields,
        age_in_days,
        // Flatten custom_data fields into the row
        ...(custom_data || {}),
        // Include tier sold status for reference
        tier_1: tier_1_sold ? 'Sold' : '',
        tier_2: tier_2_sold ? 'Sold' : '',
        tier_3: tier_3_sold ? 'Sold' : '',
        tier_4: tier_4_sold ? 'Sold' : '',
        tier_5: tier_5_sold ? 'Sold' : '',
      };
    });

    return Response.json({
      success: true,
      leads: formattedLeads,
      total: formattedLeads.length
    });

  } catch (error) {
    console.error('CSV fetch error:', error);
    return Response.json({ success: false, error: error.message, leads: [] }, { status: 500 });
  }
});