import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { isTrustedCaller } from '../../shared/internalAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { lead_id, tier, internal_token } = await req.json();

    // Only our own fulfilment flow (which sends the internal token) or an admin
    // may mark inventory as sold.
    if (!(await isTrustedCaller(base44, { internal_token }))) {
      console.warn('[updateSupabaseTierStatus] Rejected untrusted caller');
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    console.log(`[updateSupabaseTierStatus] lead_id: ${lead_id}, tier: ${tier}`);

    if (!lead_id || !tier) {
      return Response.json({ error: 'lead_id and tier are required' }, { status: 400 });
    }

    // Map tier name to Supabase column
    // Accepts: 'tier1', 'tier_1', 'tier 1'
    const tierNum = String(tier).replace(/[^1-7]/g, '');
    if (!tierNum) {
      return Response.json({ error: `Invalid tier: ${tier}` }, { status: 400 });
    }
    const column = `tier_${tierNum}_sold`;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/aged_leads?id=eq.${lead_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ [column]: true })
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('[updateSupabaseTierStatus] Supabase update failed:', text);
      return Response.json({ success: false, error: 'Failed to update tier status', details: text });
    }

    console.log(`[updateSupabaseTierStatus] Successfully set ${column}=true for lead ${lead_id}`);
    return Response.json({
      success: true,
      message: `Marked lead ${lead_id} ${column} as sold`
    });

  } catch (error) {
    console.error('Error in updateSupabaseTierStatus:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});