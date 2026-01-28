import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cartItems } = await req.json();

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
    const appUrl = req.headers.get('origin') || req.headers.get('referer');
    const successUrl = `${appUrl}/CheckoutSuccess?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/Checkout`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        user_email: user.email,
        lead_ids: cartItems.map(item => item.lead_id).join(','),
        cart_item_ids: cartItems.map(item => item.id).join(',')
      }
    });

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