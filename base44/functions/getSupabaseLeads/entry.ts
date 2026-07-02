import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized', leads: [] }, { status: 401 });

    const { filters = {}, include_last_names = false } = await req.json();

    const leadType = filters.lead_type && filters.lead_type !== 'all' 
      ? filters.lead_type.replace(/_/g, ' ') 
      : null;

    // Fetch from aged_leads in Supabase
    const PAGE_SIZE = 1000;
    let allLeads = [];
    let offset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.append('select', '*');
      if (leadType) params.append('lead_type', `ilike.${leadType}`);
      params.append('limit', String(PAGE_SIZE));
      params.append('offset', String(offset));

      const res = await fetch(`${SUPABASE_URL}/rest/v1/aged_leads?${params.toString()}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase error: ${res.status} ${text}`);
      }
      const page = await res.json();
      allLeads = allLeads.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Get suppression list
    const suppressionRecords = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldLeadIds = new Set(suppressionRecords.map(r => r.lead_id));

    // Parse and filter
    const leads = allLeads
      .filter(lead => !soldLeadIds.has(lead.id) && !soldLeadIds.has(lead.external_id))
      .map(lead => {
        let age_in_days = 0;
        if (lead.external_id) {
          const dateStr = String(lead.external_id).split('-')[0];
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

        const result = {
          ...lead,
          lead_type: lead.lead_type?.toLowerCase().replace(/\s+/g, '_'),
          age_in_days,
          ...(lead.custom_data || {}),
        };

        if (!include_last_names && result.last_name) {
          result.last_name_initial = result.last_name.charAt(0).toUpperCase();
          delete result.last_name;
        }

        return result;
      });

    return Response.json({ success: true, leads, total: leads.length });
  } catch (error) {
    console.error('getSupabaseLeads error:', error);
    return Response.json({ success: false, error: error.message, leads: [] }, { status: 500 });
  }
});