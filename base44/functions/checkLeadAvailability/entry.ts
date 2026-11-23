import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { getTierNumFromAge } from '../../shared/tierSuppression.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Age comes from the external_id upload date, the same rule checkout uses to pick a tier.
function ageInDays(lead) {
  if (lead.external_id) {
    const dateStr = String(lead.external_id).split('-')[0];
    if (dateStr.length === 8) {
      const uploadDate = new Date(
        parseInt(dateStr.substring(0, 4)),
        parseInt(dateStr.substring(4, 6)) - 1,
        parseInt(dateStr.substring(6, 8))
      );
      if (!isNaN(uploadDate.getTime())) {
        return Math.floor((Date.now() - uploadDate.getTime()) / 86400000);
      }
    }
  }
  return Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000);
}

// Tells the browse page whether a lead can still be added to a cart: a lead whose
// current age tier (1-4) has already been sold can never be purchased, so it must
// never enter the cart. Checked against live inventory plus the tier sale records.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const requested = [
      ...(Array.isArray(body.lead_ids) ? body.lead_ids : []),
      ...(body.lead_id ? [body.lead_id] : [])
    ].filter(Boolean);
    const leadIds = [...new Set(requested)];

    if (leadIds.length === 0) {
      return Response.json({ error: 'lead_id or lead_ids is required' }, { status: 400 });
    }

    const uuidIds = leadIds.filter((id) => UUID_RE.test(id));

    let leads = [];
    for (let i = 0; i < uuidIds.length; i += 100) {
      const batch = uuidIds.slice(i, i + 100);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/aged_leads?select=id,external_id,created_at,tier_1_sold,tier_2_sold,tier_3_sold,tier_4_sold&id=in.(${batch.join(',')})`,
        {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          signal: AbortSignal.timeout(10000)
        }
      );
      if (!res.ok) {
        console.error('Inventory lookup failed:', res.status, await res.text());
        return Response.json({ error: 'Could not verify lead availability' }, { status: 502 });
      }
      leads = leads.concat(await res.json());
    }

    const leadById = new Map(leads.map((lead) => [lead.id, lead]));

    // Only tiers 1-4 are limited to a single sale.
    const limitedIds = uuidIds.filter((id) => {
      const lead = leadById.get(id);
      return lead && getTierNumFromAge(ageInDays(lead)) <= 4;
    });
    const soldTierKeys = new Set();
    for (let i = 0; i < limitedIds.length; i += 50) {
      const batch = limitedIds.slice(i, i + 50);
      const records = await base44.asServiceRole.entities.LeadSuppression.filter({
        lead_id: { $in: batch },
        tier: { $in: ['tier1', 'tier2', 'tier3', 'tier4'] }
      });
      for (const record of records) soldTierKeys.add(`${record.lead_id}:${record.tier}`);
    }

    const available = [];
    const unavailable = [];
    for (const id of leadIds) {
      const lead = leadById.get(id);
      if (!lead) {
        unavailable.push({ lead_id: id, reason: 'not_found' });
        continue;
      }
      const tier = getTierNumFromAge(ageInDays(lead));
      if (tier <= 4) {
        if (lead[`tier_${tier}_sold`]) {
          unavailable.push({ lead_id: id, reason: 'sold' });
          continue;
        }
        if (soldTierKeys.has(`${id}:tier${tier}`)) {
          unavailable.push({ lead_id: id, reason: 'sold' });
          continue;
        }
      }
      available.push(id);
    }

    return Response.json({ available, unavailable });
  } catch (error) {
    console.error('checkLeadAvailability error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}