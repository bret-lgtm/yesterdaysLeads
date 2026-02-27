import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });

    const { couponCode, subtotal, customerEmail } = await req.json();

    if (!couponCode) {
      return Response.json({ error: 'No coupon code provided' }, { status: 400 });
    }

    // Look up promotion code
    const promoCodes = await stripe.promotionCodes.list({ code: couponCode, active: true, limit: 1 });

    if (!promoCodes.data.length) {
      return Response.json({ valid: false, error: 'Invalid or expired coupon code' });
    }

    const promo = promoCodes.data[0];
    const coupon = promo.coupon;

    let discountAmount = 0;
    let discountType = '';
    let discountValue = 0;

    if (coupon.percent_off) {
      discountType = 'percent';
      discountValue = coupon.percent_off;
      discountAmount = (subtotal * coupon.percent_off) / 100;
    } else if (coupon.amount_off) {
      discountType = 'fixed';
      discountValue = coupon.amount_off / 100;
      discountAmount = Math.min(coupon.amount_off / 100, subtotal);
    }

    return Response.json({
      valid: true,
      discountInfo: {
        type: discountType,
        value: discountValue,
        amount: discountAmount
      }
    });
  } catch (error) {
    console.error('Error validating coupon:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});