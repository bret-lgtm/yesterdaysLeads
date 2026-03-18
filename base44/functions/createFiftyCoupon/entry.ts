import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });

    // Create a $50 off coupon
    const coupon = await stripe.coupons.create({
      amount_off: 5000, // $50 in cents
      currency: 'usd',
      duration: 'once',
      id: 'fifty'
    });

    // Create a promotion code for the coupon
    const promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: 'fifty'
    });

    return Response.json({ 
      success: true,
      coupon: coupon,
      promoCode: promo
    });
  } catch (error) {
    console.error('Error creating coupon:', error.message);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});