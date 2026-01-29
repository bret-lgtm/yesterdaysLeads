import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
    apiVersion: '2023-10-16'
  });
  console.log('Webhook using Stripe key:', Deno.env.get("STRIPE_SECRET_KEY")?.substring(0, 7));
  console.log('Webhook secret available:', !!Deno.env.get('STRIPE_WEBHOOK_SECRET'));
  const base44 = createClientFromRequest(req);
  
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set');
      return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    // Verify webhook signature
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );

    console.log('Webhook event received:', event.type);

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata;

      console.log('Processing completed checkout:', session.id);

      // Extract data from metadata
      const userEmail = metadata.user_email;
      const cartItemIds = metadata.cart_item_ids.split(',').filter(id => id.trim());

      // Fetch specific cart items from database using IDs
      const cartItems = [];
      for (const id of cartItemIds) {
        try {
          const item = await base44.asServiceRole.entities.CartItem.get(id);
          if (item) {
            cartItems.push(item);
          }
        } catch (err) {
          console.warn(`Could not fetch cart item ${id}:`, err.message);
        }
      }

      console.log('Cart items count:', cartItems.length);
      console.log('Cart items:', cartItems);

      // Get or create customer record
      let customer = (await base44.asServiceRole.entities.Customer.filter({ email: userEmail }))[0];
      if (!customer) {
        const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        const user = users[0];
        
        customer = await base44.asServiceRole.entities.Customer.create({
          user_id: user?.id,
          email: userEmail,
          full_name: session.customer_details?.name || userEmail,
          suppression_list: []
        });
      }

      // Use cart items as the lead data snapshot
      const completeLeadData = cartItems;

      console.log('Complete lead data count:', completeLeadData.length);
      console.log('Session total:', session.amount_total / 100);

      // Create order
      const order = await base44.asServiceRole.entities.Order.create({
        customer_id: customer.id,
        customer_email: userEmail,
        total_price: session.amount_total / 100, // Convert from cents
        lead_count: completeLeadData.length,
        stripe_transaction_id: session.payment_intent,
        leads_purchased: cartItems.map(item => item.lead_id),
        lead_data_snapshot: completeLeadData,
        status: 'completed'
      });

      console.log('Order created:', order.id);

      // Update suppression list with lead IDs from cart
      const leadIdsToSuppress = cartItems.map(item => item.lead_id).filter(Boolean);
      const updatedSuppressionList = [...(customer.suppression_list || []), ...leadIdsToSuppress];
      await base44.asServiceRole.entities.Customer.update(customer.id, {
        suppression_list: updatedSuppressionList
      });

      // Clear cart items
      for (const cartItemId of cartItemIds) {
        try {
          await base44.asServiceRole.entities.CartItem.delete(cartItemId);
        } catch (err) {
          console.warn(`Could not delete cart item ${cartItemId}:`, err.message);
        }
      }

      console.log('Checkout processing complete');
    }

    return Response.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 400 });
  }
});