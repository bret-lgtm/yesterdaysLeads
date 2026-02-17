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

    // Create a temporary order record to store cart data
    const tempOrder = await base44.asServiceRole.entities.Order.create({
      customer_id: 'pending',
      customer_email: user?.email || customerEmail,
      total_price: cartItems.reduce((sum, item) => sum + item.price, 0),
      lead_count: cartItems.length,
      stripe_transaction_id: 'pending',
      leads_purchased: cartItems.map(item => item.lead_id),
      lead_data_snapshot: cartItems.map(item => ({
        id: item.id,
        lead_id: item.lead_id,
        age_in_days: item.age_in_days
      })),
      status: 'pending'
    });
    
    // Build checkout session config
    const checkoutConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user?.email || customerEmail,
      client_reference_id: tempOrder.id,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        user_email: user?.email || customerEmail,
        lead_count: cartItems.length.toString(),
        temp_order_id: tempOrder.id
      }
    };

    // Add discount if coupon code provided
    if (couponCode) {
      checkoutConfig.discounts = [{
        coupon: couponCode
      }];
    }

    // Create Stripe checkout session
    let session;
    try {
      session = await stripe.checkout.sessions.create(checkoutConfig);
    } catch (stripeError) {
      // If coupon is invalid, try again without it
      if (couponCode && stripeError.type === 'StripeInvalidRequestError') {
        console.error('Invalid coupon code:', couponCode);
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
      url: session.url 
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});