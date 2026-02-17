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

      // Get temp order ID from metadata (fallback to client_reference_id)
      const tempOrderId = metadata.temp_order_id || session.client_reference_id;
      console.log('Temp order ID:', tempOrderId);

      // Check if order already exists for this payment_intent or session (prevent duplicate processing)
      const existingOrders = await base44.asServiceRole.entities.Order.filter({ 
        stripe_transaction_id: session.payment_intent 
      });
      
      if (existingOrders.length > 0) {
        console.log('Order already processed for payment_intent:', session.payment_intent);
        // Clean up temp order if it still exists
        try {
          await base44.asServiceRole.entities.Order.delete(tempOrderId);
        } catch (err) {
          console.log('Temp order already deleted or not found');
        }
        return Response.json({ received: true, message: 'Already processed' });
      }

      // Fetch the temporary order
      let tempOrder;
      try {
        tempOrder = await base44.asServiceRole.entities.Order.get(tempOrderId);
        
        // Check if temp order is already being processed (status changed from 'pending')
        if (tempOrder.status !== 'pending') {
          console.log('Temp order already processed, status:', tempOrder.status);
          return Response.json({ received: true, message: 'Order already being processed' });
        }
        
        // Immediately update status to prevent duplicate processing
        await base44.asServiceRole.entities.Order.update(tempOrderId, { 
          status: 'processing' 
        });
        
      } catch (err) {
        console.error('Temp order not found:', tempOrderId, 'Error:', err.message);
        console.log('Session data:', JSON.stringify(session, null, 2));
        return Response.json({ error: 'Temp order not found', tempOrderId }, { status: 404 });
      }

      const userEmail = tempOrder.customer_email;
      const cartItemData = tempOrder.lead_data_snapshot;

      console.log('User email:', userEmail);
      console.log('Cart items count:', cartItemData.length);

      // Use cart item data directly from snapshot
      const cartItems = cartItemData.map(item => ({
        id: item.id,
        lead_id: item.lead_id,
        lead_type: item.lead_type,
        lead_name: item.lead_name,
        state: item.state,
        zip_code: item.zip_code,
        age_in_days: item.age_in_days,
        price: item.price
      }));

      console.log('Cart items count:', cartItems.length);
      console.log('Cart items:', cartItems.map(c => ({id: c.id, lead_id: c.lead_id})));

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

        // Filter out system fields before storing snapshot
        completeLeadData = completeLeadData.map(lead => {
          const filtered = {};
          Object.entries(lead).forEach(([key, value]) => {
            // Exclude system/internal fields
            if (!['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'].includes(key)) {
              filtered[key] = value;
            }
          });
          return filtered;
        });

        console.log('Complete lead data fetched:', completeLeadData.length);
        console.log('Sample lead data:', JSON.stringify(completeLeadData[0] || {}));
      } catch (err) {
        console.error('Failed to fetch complete lead data:', err.message);
        // Fallback: try to get basic cart data
        completeLeadData = cartItems.map(item => ({
          lead_id: item.lead_id,
          lead_type: item.lead_type,
          lead_name: item.lead_name,
          state: item.state,
          zip_code: item.zip_code,
          age_in_days: item.age_in_days,
          price: item.price
        }));
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

      // Track lead purchase completion
      if (base44.analytics) {
        await base44.analytics.track({
          eventName: 'lead_purchase_completed',
          properties: {
            order_id: order.id,
            lead_count: cartItems.length,
            total_price: session.amount_total / 100,
            customer_email: userEmail
          }
        });
      }

      // Sync to HubSpot
      try {
        await base44.asServiceRole.functions.invoke('syncOrderToHubspot', {
          orderData: order
        });
      } catch (hubspotError) {
        console.error('Failed to sync to HubSpot:', hubspotError);
        // Don't fail the webhook if HubSpot sync fails
      }

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