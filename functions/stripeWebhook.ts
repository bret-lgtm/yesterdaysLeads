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

      // Get temp order ID from client_reference_id
      const tempOrderId = session.client_reference_id;
      console.log('Temp order ID:', tempOrderId);

      // Fetch the temporary order
      const tempOrder = await base44.asServiceRole.entities.Order.get(tempOrderId);
      if (!tempOrder) {
        console.error('Temp order not found:', tempOrderId);
        return Response.json({ error: 'Order not found' }, { status: 404 });
      }

      const userEmail = tempOrder.customer_email;
      const cartItemData = tempOrder.lead_data_snapshot;

      console.log('User email:', userEmail);
      console.log('Cart items count:', cartItemData.length);

      // Fetch full cart items from database
      const cartItems = [];
      for (const itemData of cartItemData) {
        try {
          const item = await base44.asServiceRole.entities.CartItem.get(itemData.id);
          if (item) {
            cartItems.push(item);
          }
        } catch (err) {
          console.warn(`Could not fetch cart item ${itemData.id}:`, err.message);
        }
      }

      console.log('Cart items count:', cartItems.length);
      console.log('Cart items fetched:', cartItems.map(c => ({id: c.id, lead_id: c.lead_id})));

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

      // Fetch complete lead data from Google Sheets for CSV
      const leadIds = cartItems.map(item => item.lead_id);
      let completeLeadData = [];
      
      try {
        const sheetsResponse = await base44.asServiceRole.functions.invoke('getLeadsFromSheetsForCSV', { 
          lead_ids: leadIds
        });
        completeLeadData = sheetsResponse.data.leads || [];
        console.log('Complete lead data fetched:', completeLeadData.length);
      } catch (err) {
        console.error('Failed to fetch complete lead data, using cart data:', err.message);
        completeLeadData = cartItemData;
      }

      console.log('Session total:', session.amount_total / 100);

      // Create order - use cartItems.length for accurate lead count
      const order = await base44.asServiceRole.entities.Order.create({
        customer_id: customer.id,
        customer_email: userEmail,
        total_price: session.amount_total / 100, // Convert from cents
        lead_count: cartItems.length,
        stripe_transaction_id: session.payment_intent,
        leads_purchased: cartItems.map(item => item.lead_id),
        lead_data_snapshot: completeLeadData,
        status: 'completed'
      });

      console.log('Order created:', order.id);

      // Delete the temporary order
      await base44.asServiceRole.entities.Order.delete(tempOrderId);

      // Create lead suppression records for tier-based suppression
      // Determine tier for each lead based on age
      function getTierFromAge(ageInDays) {
        if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
        if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
        if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
        if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
        if (ageInDays >= 91) return 'tier5';
        return 'tier1';
      }

      for (const cartItem of cartItems) {
        const tier = getTierFromAge(cartItem.age_in_days || 1);
        await base44.asServiceRole.entities.LeadSuppression.create({
          lead_id: cartItem.lead_id,
          tier: tier,
          order_id: order.id,
          sale_date: new Date().toISOString()
        });

        // Update the Google Sheet tier status
        try {
          const sheetUpdateResponse = await base44.asServiceRole.functions.invoke('updateSheetTierStatus', {
            lead_id: cartItem.lead_id,
            tier: tier
          });
          console.log(`Sheet update response for ${cartItem.lead_id} (${tier}):`, JSON.stringify(sheetUpdateResponse.data));
          if (!sheetUpdateResponse.data?.success) {
            console.error(`Sheet update failed for ${cartItem.lead_id}:`, sheetUpdateResponse.data?.error);
          }
        } catch (err) {
          console.error(`Failed to update sheet for ${cartItem.lead_id}:`, err.message, err.stack);
        }
      }

      // Clear cart items
      for (const itemData of cartItemData) {
        try {
          await base44.asServiceRole.entities.CartItem.delete(itemData.id);
        } catch (err) {
          console.warn(`Could not delete cart item ${itemData.id}:`, err.message);
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