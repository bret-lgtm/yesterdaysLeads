import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized', leads: [] }, { status: 401 });

    const { lead_ids = [] } = await req.json();
    if (!lead_ids || lead_ids.length === 0) {
      return Response.json({ success: false, error: 'No lead IDs provided', leads: [] });
    }

    const uniqueLeadIds = [...new Set(lead_ids)];
    let allLeads = [];

    // Fetch from aged_leads by UUID
    const BATCH_SIZE = 200;
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
        console.error('Supabase fetch error:', await res.text());
        continue;
      }

      const rows = await res.json();
      const formatted = rows.map(lead => {
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
          ...(custom_data || {}),
        };
      });
      allLeads = allLeads.concat(formatted);
    }

    return Response.json({
      success: true,
      leads: allLeads,
      total: allLeads.length
    });
  } catch (error) {
    console.error('getLeadsFromSheetsForCSV error:', error);
    return Response.json({ success: false, error: error.message, leads: [] }, { status: 500 });
  }
});