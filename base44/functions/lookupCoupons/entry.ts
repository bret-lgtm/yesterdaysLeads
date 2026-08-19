import Stripe from 'npm:stripe';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user?.email) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });

    const { search } = await req.json().catch(() => ({}));
    const query = (search || '').trim().toLowerCase();

    // Fetch all promotion codes (paginated)
    let hasMore = true;
    let startingAfter: string | undefined;
    const allPromos: any[] = [];
    while (hasMore && allPromos.length < 200) {
      const params: any = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const batch = await stripe.promotionCodes.list(params);
      allPromos.push(...batch.data);
      hasMore = batch.has_more;
      startingAfter = batch.data[batch.data.length - 1]?.id;
    }

    // Fetch all coupons (paginated)
    hasMore = true;
    startingAfter = undefined;
    const allCoupons: any[] = [];
    while (hasMore && allCoupons.length < 200) {
      const params: any = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const batch = await stripe.coupons.list(params);
      allCoupons.push(...batch.data);
      hasMore = batch.has_more;
      startingAfter = batch.data[batch.data.length - 1]?.id;
    }

    // Build a map of coupon id -> coupon details
    const couponMap = new Map<string, any>();
    for (const c of allCoupons) couponMap.set(c.id, c);

    // Build promo code records with linked coupon info
    let promoRecords = allPromos.map((p) => {
      const coupon = couponMap.get(p.coupon?.id || p.coupon) || p.coupon;
      return {
        type: 'promotion_code',
        id: p.id,
        code: p.code,
        active: p.active,
        created: new Date(p.created * 1000).toISOString(),
        times_redeemed: p.times_redeemed,
        max_redemptions: p.max_redemptions,
        expires_at: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
        customer: p.customer,
        coupon: coupon ? {
          id: coupon.id,
          name: coupon.name,
          percent_off: coupon.percent_off,
          amount_off: coupon.amount_off,
          currency: coupon.currency,
          duration: coupon.duration,
          duration_in_months: coupon.duration_in_months,
          max_redemptions: coupon.max_redemptions,
          times_redeemed: coupon.times_redeemed,
          valid: coupon.valid,
          redeemed: coupon.times_redeemed,
        } : null
      };
    });

    // Also include coupons that have no promotion codes attached
    const promoCouponIds = new Set(allPromos.map(p => p.coupon?.id || p.coupon).filter(Boolean));
    const standaloneCoupons = allCoupons
      .filter(c => !promoCouponIds.has(c.id))
      .map((c) => ({
        type: 'coupon',
        id: c.id,
        code: null,
        active: c.valid,
        created: new Date(c.created * 1000).toISOString(),
        times_redeemed: c.times_redeemed,
        max_redemptions: c.max_redemptions,
        expires_at: null,
        customer: null,
        coupon: {
          id: c.id,
          name: c.name,
          percent_off: c.percent_off,
          amount_off: c.amount_off,
          currency: c.currency,
          duration: c.duration,
          duration_in_months: c.duration_in_months,
          max_redemptions: c.max_redemptions,
          times_redeemed: c.times_redeemed,
          valid: c.valid,
          redeemed: c.times_redeemed,
        }
      }));

    let records = [...promoRecords, ...standaloneCoupons];

    // Filter by search query (matches code, coupon id, or coupon name)
    if (query) {
      records = records.filter(r =>
        (r.code || '').toLowerCase().includes(query) ||
        (r.coupon?.id || '').toLowerCase().includes(query) ||
        (r.coupon?.name || '').toLowerCase().includes(query)
      );
    }

    // Sort: most recently created first
    records.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

    return Response.json({ records, total: records.length });
  } catch (error) {
    console.error('Error looking up coupons:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});