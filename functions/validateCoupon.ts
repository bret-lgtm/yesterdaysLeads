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

    // Check if this promo code restricts to one use per customer
    // by looking at past Stripe charges with this coupon for this customer
    if (customerEmail && coupon.max_redemptions_per_customer !== undefined) {
      // Stripe handles this natively, nothing extra needed
    }

    // Check our own Order records to see if this customer already used this coupon
    if (customerEmail) {
      const base44 = createClientFromRequest(req);
      const existingOrders = await base44.asServiceRole.entities.Order.filter({ customer_email: customerEmail });
      const alreadyUsed = existingOrders.some(order => order.coupon_code === couponCode.toUpperCase() && order.status === 'completed');
      if (alreadyUsed) {
        return Response.json({ valid: false, error: 'This coupon has already been used on a previous order' });
      }
    }

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