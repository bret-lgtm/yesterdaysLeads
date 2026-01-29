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
      const leadIds = metadata.lead_ids.split(',').filter(id => id.trim());
      const cartItemIds = metadata.cart_item_ids.split(',').filter(id => id.trim());

      console.log('Lead IDs from metadata:', leadIds);
      console.log('Lead IDs count:', leadIds.length);

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

      // Get full lead data from Google Sheets using external IDs
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');
      const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
      
      // Get purchased leads from database to get external IDs
      const purchasedLeads = await Promise.all(
        leadIds.map(id => base44.asServiceRole.entities.Lead.get(id))
      );

      // Fetch full data from sheets
      const fullLeadsResponse = await base44.asServiceRole.functions.invoke('getLeadsFromSheets', {
        filters: {},
        include_last_names: true
      });
      
      const fullLeadsMap = {};
      fullLeadsResponse.data.leads.forEach(lead => {
        if (!fullLeadsMap[lead.external_id]) {
          fullLeadsMap[lead.external_id] = [];
        }
        fullLeadsMap[lead.external_id].push(lead);
      });
      
      // Match purchased leads with full data, maintaining order
      const completeLeadData = purchasedLeads.map(lead => {
        const matches = fullLeadsMap[lead.external_id];
        if (matches && matches.length > 0) {
          return matches.shift(); // Take first match, remove from array
        }
        return lead;
      });

      console.log('Complete lead data count:', completeLeadData.length);
      console.log('Session total:', session.amount_total / 100);

      // Create order
      const order = await base44.asServiceRole.entities.Order.create({
        customer_id: customer.id,
        customer_email: userEmail,
        total_price: session.amount_total / 100, // Convert from cents
        lead_count: completeLeadData.length,
        stripe_transaction_id: session.payment_intent,
        leads_purchased: leadIds,
        lead_data_snapshot: completeLeadData,
        status: 'completed'
      });

      console.log('Order created:', order.id);

      // Update leads to sold
      for (const leadId of leadIds) {
        await base44.asServiceRole.entities.Lead.update(leadId, { status: 'sold' });
      }

      // Update suppression list
      const updatedSuppressionList = [...(customer.suppression_list || []), ...leadIds];
      await base44.asServiceRole.entities.Customer.update(customer.id, {
        suppression_list: updatedSuppressionList
      });

      // Clear cart items
      for (const cartItemId of cartItemIds) {
        await base44.asServiceRole.entities.CartItem.delete(cartItemId);
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