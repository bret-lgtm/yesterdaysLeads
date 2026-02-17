import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });

    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'once',
      id: 'mercedes'
    });

    return Response.json({ 
      success: true,
      coupon: coupon
    });
  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});