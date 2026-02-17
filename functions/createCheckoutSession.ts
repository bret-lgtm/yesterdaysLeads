import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });
    console.log('Using Stripe key:', Deno.env.get("STRIPE_SECRET_KEY")?.substring(0, 7));
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const { cartItems, customerEmail, couponCode } = await req.json();

    if (!cartItems || cartItems.length === 0) {
      return Response.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // Create line items for Stripe
    const lineItems = cartItems.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${item.lead_type.toUpperCase()} Lead - ${item.lead_name}`,
          description: `${item.state} • ${item.age_in_days} days old`
        },
        unit_amount: Math.round(item.price * 100) // Convert to cents
      },
      quantity: 1
    }));

    // Get app URL for redirect
    let appUrl = req.headers.get('origin') || req.headers.get('referer') || Deno.env.get('APP_URL');
    if (!appUrl) {
      return Response.json({ error: 'Invalid app configuration' }, { status: 500 });
    }
    // Remove trailing slash and path
    appUrl = appUrl.split('?')[0];
    const successUrl = `${appUrl}/CheckoutSuccess?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/Checkout`;

    // Calculate subtotal first
    const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);

    // Validate and get discount info if coupon code provided
    let discountInfo = null;
    if (couponCode) {
      try {
        // Look up promotion codes by coupon code name
        const promos = await stripe.promotionCodes.list({ 
          code: couponCode,
          limit: 1,
          active: true
        });

        if (promos.data.length > 0) {
          const promo = promos.data[0];
          const coupon = promo.coupon;
          
          if (coupon.percent_off) {
            discountInfo = {
              type: 'percent',
              value: coupon.percent_off,
              amount: Math.round(subtotal * coupon.percent_off / 100 * 100) / 100
            };
          } else if (coupon.amount_off) {
            discountInfo = {
              type: 'fixed',
              value: coupon.amount_off / 100,
              amount: coupon.amount_off / 100
            };
          }
        }
      } catch (couponError) {
        console.error('Invalid coupon code:', couponCode, couponError.message);
        // Continue without coupon
      }
    }

    // Calculate final total
    const finalTotal = discountInfo ? Math.round((subtotal - discountInfo.amount) * 100) / 100 : subtotal;

    // If total is free, create order directly without Stripe
    if (finalTotal <= 0) {
      const freeOrder = await base44.asServiceRole.entities.Order.create({
        customer_id: 'free_customer',
        customer_email: user?.email || customerEmail,
        total_price: 0,
        lead_count: cartItems.length,
        stripe_transaction_id: 'free_order',
        leads_purchased: cartItems.map(item => item.lead_id),
        lead_data_snapshot: cartItems,
        status: 'completed'
      });

      // Clean up temporary order
      if (tempOrder?.id) {
        await base44.asServiceRole.entities.Order.delete(tempOrder.id).catch(() => null);
      }

      return Response.json({ 
        sessionId: null,
        url: null,
        discountInfo,
        subtotal,
        finalTotal,
        freeOrder: true,
        orderId: freeOrder.id
      });
    }

    // Create Stripe checkout session for paid orders
    let session;
    try {
      session = await stripe.checkout.sessions.create(checkoutConfig);
    } catch (stripeError) {
      // If coupon is invalid, try again without it
      if (couponCode && stripeError.type === 'StripeInvalidRequestError') {
        console.error('Coupon validation failed:', couponCode);
        delete checkoutConfig.discounts;
        session = await stripe.checkout.sessions.create(checkoutConfig);
        // Return success but notify about invalid coupon
        return Response.json({ 
          sessionId: session.id,
          url: session.url,
          warning: 'Coupon code was invalid and was not applied'
        });
      }
      throw stripeError;
    }

    return Response.json({ 
      sessionId: session.id,
      url: session.url,
      discountInfo,
      subtotal,
      finalTotal
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});