import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe';

// One-time recovery: rebuild order from Stripe checkout session when temp order is gone
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { payment_intent_id } = await req.json();
    if (!payment_intent_id) {
      return Response.json({ error: 'payment_intent_id required' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });

    // Check if order already exists
    const existing = await base44.asServiceRole.entities.Order.filter({ stripe_transaction_id: payment_intent_id });
    if (existing.length > 0) {
      return Response.json({ message: 'Order already exists', order_id: existing[0].id });
    }

    // Fetch the checkout session
    const sessions = await stripe.checkout.sessions.list({ payment_intent: payment_intent_id, limit: 1 });
    if (sessions.data.length === 0) {
      return Response.json({ error: 'No checkout session found for this payment intent' }, { status: 404 });
    }

    const session = sessions.data[0];
    console.log('Session ID:', session.id);
    console.log('Session status:', session.status);
    console.log('Session amount:', session.amount_total);
    console.log('Session metadata:', JSON.stringify(session.metadata));

    const customerEmail = session.customer_details?.email || session.customer_email;
    if (!customerEmail) {
      return Response.json({ error: 'No customer email found in session' }, { status: 400 });
    }

    const metadata = session.metadata || {};
    const tempOrderId = metadata.temp_order_id || session.client_reference_id;
    console.log('Temp order ID from metadata:', tempOrderId);

    // Try to get the temp order (it may still exist or may have been deleted)
    let leadIds = [];
    let leadDataSnapshot = [];

    if (tempOrderId) {
      try {
        const tempOrder = await base44.asServiceRole.entities.Order.get(tempOrderId);
        leadIds = tempOrder.leads_purchased || [];
        leadDataSnapshot = tempOrder.lead_data_snapshot || [];
        console.log('Got lead data from temp order:', leadIds.length, 'leads');
      } catch (err) {
        console.log('Temp order not found:', err.message);
      }
    }

    if (leadIds.length === 0) {
      return Response.json({ 
        error: 'Could not find lead data - temp order is gone. Manual recovery needed.',
        session_id: session.id,
        customer_email: customerEmail,
        amount: session.amount_total / 100,
        metadata
      }, { status: 404 });
    }

    // Fetch complete lead data from sheets
    const SYSTEM_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'];
    let completeLeadData = [];
    try {
      const sheetsResponse = await base44.asServiceRole.functions.invoke('getLeadsFromSheetsForCSV', { lead_ids: leadIds });
      const raw = sheetsResponse.data.leads || [];
      completeLeadData = raw.map(lead => {
        const filtered = {};
        Object.entries(lead).forEach(([k, v]) => { if (!SYSTEM_FIELDS.includes(k)) filtered[k] = v; });
        return filtered;
      });
      console.log('Lead data fetched from sheets:', completeLeadData.length);
    } catch (err) {
      console.error('Failed to fetch lead data from sheets:', err.message);
      completeLeadData = leadDataSnapshot;
      console.log('Using snapshot data:', completeLeadData.length);
    }

    // Get or create customer
    let customer = (await base44.asServiceRole.entities.Customer.filter({ email: customerEmail }))[0];
    if (!customer) {
      customer = await base44.asServiceRole.entities.Customer.create({
        email: customerEmail,
        full_name: session.customer_details?.name || customerEmail,
        suppression_list: []
      });
    }

    // Create the completed order
    const order = await base44.asServiceRole.entities.Order.create({
      customer_id: customer.id,
      customer_email: customerEmail,
      total_price: session.amount_total / 100,
      lead_count: leadIds.length,
      stripe_transaction_id: payment_intent_id,
      leads_purchased: leadIds,
      lead_data_snapshot: completeLeadData,
      status: 'completed'
    });

    console.log('Order created:', order.id);

    // Create LeadSuppression records
    function getTierFromAge(ageInDays) {
      if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
      if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
      if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
      if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
      if (ageInDays >= 91) return 'tier5';
      return 'tier1';
    }

    for (const cartItem of leadDataSnapshot) {
      const tier = getTierFromAge(cartItem.age_in_days || 1);
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: cartItem.lead_id,
        tier,
        order_id: order.id,
        sale_date: new Date().toISOString()
      });
    }

    // Delete temp order if it still exists
    if (tempOrderId) {
      try {
        await base44.asServiceRole.entities.Order.delete(tempOrderId);
        console.log('Temp order deleted');
      } catch (err) {
        console.log('Temp order already gone');
      }
    }

    return Response.json({ 
      success: true, 
      new_order_id: order.id, 
      customer_email: customerEmail, 
      lead_count: leadIds.length,
      total: session.amount_total / 100
    });

  } catch (error) {
    console.error('Recovery error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});