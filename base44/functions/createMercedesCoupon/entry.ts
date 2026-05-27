import Stripe from 'npm:stripe';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });

    // Get or create the coupon
    let coupon;
    try {
      coupon = await stripe.coupons.retrieve('mercedes');
    } catch {
      coupon = await stripe.coupons.create({
        percent_off: 100,
        duration: 'once',
        id: 'mercedes'
      });
    }

    // Create a promotion code for the coupon
    const promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: 'mercedes'
    });

    return Response.json({ 
      success: true,
      coupon: coupon,
      promoCode: promo
    });
  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});