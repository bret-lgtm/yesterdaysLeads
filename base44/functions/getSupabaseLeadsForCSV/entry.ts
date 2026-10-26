import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { isInternalCaller } from '../../shared/internalAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { lead_ids = [], internal_token } = await req.json().catch(() => ({}));

    // Internal fulfilment calls (payment webhook, checkout, recovery) carry the
    // internal token; admins use the dashboard; everyone else is a customer.
    const internal = isInternalCaller({ internal_token });
    const user = internal ? null : await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!internal && !user) {
      return Response.json({ success: false, error: 'Unauthorized', leads: [] }, { status: 401 });
    }

    if (!lead_ids || lead_ids.length === 0) {
      return Response.json({ success: false, error: 'No lead IDs provided', leads: [] });
    }

    let uniqueLeadIds = [...new Set(lead_ids)];

    // A customer may only pull the full records of leads they actually bought.
    if (!internal && user.role !== 'admin') {
      const ownOrders = await base44.entities.Order.filter({
        customer_email: user.email,
        status: { $in: ['completed', 'processing'] }
      });
      const owned = new Set();
      for (const order of ownOrders) {
        (order.leads_purchased || []).forEach(id => owned.add(id));
        (order.lead_data_snapshot || []).forEach(snap => {
          if (snap?.id) owned.add(snap.id);
          if (snap?.external_id) owned.add(snap.external_id);
        });
      }
      uniqueLeadIds = uniqueLeadIds.filter(id => owned.has(id));
      if (uniqueLeadIds.length === 0) {
        console.warn(`getSupabaseLeadsForCSV denied for ${user.email}: no matching purchases`);
        return Response.json({ success: false, error: 'Forbidden', leads: [] }, { status: 403 });
      }
    }

    // Separate UUID IDs (query by id) from non-UUID IDs (query by external_id).
    // A single non-UUID in an id=in.(...) batch causes PostgREST to reject the entire query.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidIds = uniqueLeadIds.filter(id => UUID_RE.test(id));
    const nonUuidIds = uniqueLeadIds.filter(id => !UUID_RE.test(id));

    const formatLead = (lead) => {
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
      const { custom_data, created_at, ...coreFields } = lead;
      // Strip all tier_*_sold fields so pricing tiers never reach the CSV
      const cleanedCore = {};
      for (const [key, value] of Object.entries(coreFields)) {
        if (!/^tier_\d+_sold$/.test(key)) {
          cleanedCore[key] = value;
        }
      }
      return {
        ...cleanedCore,
        age_in_days,
        ...(custom_data || {}),
      };
    };

    const fetchBatch = async (filterParam) => {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/aged_leads?${filterParam}&select=*`,
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
        return [];
      }
      const rows = await res.json();
      return rows.map(formatLead);
    };

    let allLeads = [];

    // Fetch UUID IDs by id
    const BATCH_SIZE = 200;
    for (let i = 0; i < uuidIds.length; i += BATCH_SIZE) {
      const batch = uuidIds.slice(i, i + BATCH_SIZE);
      const idList = batch.map(id => `"${id}"`).join(',');
      allLeads = allLeads.concat(await fetchBatch(`id=in.(${idList})`));
    }

    // Fetch non-UUID IDs by external_id
    if (nonUuidIds.length > 0) {
      const extList = nonUuidIds.map(id => `"${id}"`).join(',');
      allLeads = allLeads.concat(await fetchBatch(`external_id=in.(${extList})`));
    }

    return Response.json({
      success: true,
      leads: allLeads,
      total: allLeads.length
    });
  } catch (error) {
    console.error('getSupabaseLeadsForCSV error:', error);
    return Response.json({ success: false, error: error.message, leads: [] }, { status: 500 });
  }
});