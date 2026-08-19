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

    // Fetch our Order records to cross-reference redemptions with internal orders
    const orders: any[] = [];
    try {
      let hasMoreOrders = true;
      let skip = 0;
      while (hasMoreOrders && skip < 500) {
        const batch = await base44.entities.Order.list('-created_date', 100);
        orders.push(...batch);
        hasMoreOrders = batch.length === 100;
        skip += 100;
      }
    } catch (e) {
      console.error('Error fetching orders for cross-reference:', e.message);
    }
    // Map by stripe_transaction_id (checkout session id or payment intent)
    const orderByTxn = new Map<string, any>();
    for (const o of orders) {
      if (o.stripe_transaction_id) orderByTxn.set(o.stripe_transaction_id, o);
    }

    // For each Order with a payment intent, look up the checkout session by payment_intent
    // to find which promotion code was used and who redeemed it
    const redemptionMap = new Map<string, any[]>();
    try {
      // Get payment intent IDs from orders (stripe_transaction_id is typically pi_xxx)
      const paymentIntentIds = orders
        .map(o => o.stripe_transaction_id)
        .filter(id => id && id.startsWith('pi_'));

      // Look up checkout sessions by payment_intent in parallel
      const sessionResults = await Promise.all(
        paymentIntentIds.slice(0, 200).map(async (piId) => {
          try {
            const res = await stripe.checkout.sessions.list({
              payment_intent: piId,
              limit: 1,
              expand: ['data.discounts'],
            });
            return res.data[0] || null;
          } catch (e) {
            return null;
          }
        })
      );

      // Build a set of redeemed promo IDs for quick lookup
      const redeemedPromoIds = new Set(allPromos.filter(p => p.times_redeemed > 0).map(p => p.id));

      for (const s of sessionResults) {
        if (!s) continue;
        const discounts = s.discounts || [];
        let promoCodeId: string | null = null;

        if (Array.isArray(discounts)) {
          for (const d of discounts) {
            if (d?.promotion_code) {
              promoCodeId = d.promotion_code;
              break;
            }
          }
        }

        if (promoCodeId && redeemedPromoIds.has(promoCodeId)) {
          if (!redemptionMap.has(promoCodeId)) redemptionMap.set(promoCodeId, []);
          const matchedOrder = orderByTxn.get(s.payment_intent);
          redemptionMap.get(promoCodeId)!.push({
            session_id: s.id,
            customer_email: s.customer_email || s.customer_details?.email || null,
            customer_name: s.customer_details?.name || null,
            customer_phone: s.customer_details?.phone || null,
            amount_total: s.amount_total,
            currency: s.currency,
            created: new Date(s.created * 1000).toISOString(),
            payment_status: s.payment_status,
            order_id: matchedOrder?.id || null,
            order_status: matchedOrder?.status || null,
            lead_count: matchedOrder?.lead_count || null,
          });
        }
      }
    } catch (e) {
      console.error('Error fetching checkout sessions for redemptions:', e.message);
    }

    // Build promo code records with linked coupon info and redemptions
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
        redemptions: redemptionMap.get(p.id) || [],
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