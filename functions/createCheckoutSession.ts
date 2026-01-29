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

    const { cartItems, customerEmail } = await req.json();

    if (!cartItems || cartItems.length === 0) {
      return Response.json({ error: 'Cart is empty' }, { status: 400 });
    }

    const userEmail = user?.email || customerEmail;

    // Ensure cart items exist in database - create them if they don't
    const savedCartItems = [];
    for (const item of cartItems) {
      try {
        // Try to get existing cart item
        let savedItem = item.id ? await base44.asServiceRole.entities.CartItem.get(item.id) : null;
        
        // If it doesn't exist or no ID, create it
        if (!savedItem) {
          savedItem = await base44.asServiceRole.entities.CartItem.create({
            user_email: userEmail,
            lead_id: item.lead_id,
            lead_type: item.lead_type,
            lead_name: item.lead_name,
            state: item.state,
            zip_code: item.zip_code,
            age_in_days: item.age_in_days,
            price: item.price
          });
        }
        savedCartItems.push(savedItem);
      } catch (err) {
        console.warn(`Could not save cart item:`, err.message);
        // Continue with the item as-is if save fails
        savedCartItems.push(item);
      }
    }

    console.log('Saved cart items to database:', savedCartItems.length);

    // Create line items for Stripe
    const lineItems = savedCartItems.map(item => ({
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
      customer_email: user?.email || customerEmail,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        user_email: userEmail,
        cart_item_ids: savedCartItems.map(item => item.id).join(',')
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