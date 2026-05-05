import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe';

// Fix an existing order that has 0 leads by fetching data from the Stripe session
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return Response.json({ error: 'order_id required' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });

    const order = await base44.asServiceRole.entities.Order.get(order_id);
    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.lead_count > 0 || (order.leads_purchased && order.leads_purchased.length > 0)) {
      return Response.json({ error: 'Order already has leads — not empty', lead_count: order.lead_count }, { status: 400 });
    }

    const paymentIntentId = order.stripe_transaction_id;
    if (!paymentIntentId) {
      return Response.json({ error: 'Order has no stripe_transaction_id' }, { status: 400 });
    }

    // Fetch the checkout session from Stripe
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1, expand: ['data.line_items'] });
    if (sessions.data.length === 0) {
      return Response.json({ error: 'No checkout session found for this payment intent' }, { status: 404 });
    }

    const session = sessions.data[0];
    console.log('Session ID:', session.id);
    console.log('Session metadata:', JSON.stringify(session.metadata));

    const tempOrderId = session.metadata?.temp_order_id || session.client_reference_id;
    console.log('Temp order ID:', tempOrderId);

    // Try to get lead data from the temp order
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
        error: 'Temp order is gone — cannot automatically recover lead list. Manual fix needed.',
        session_id: session.id,
        session_metadata: session.metadata,
        customer_email: order.customer_email,
        amount_paid: order.total_price
      }, { status: 404 });
    }

    // Fetch complete lead data from sheets
    const SYSTEM_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'];
    let completeLeadData = leadDataSnapshot;
    try {
      const sheetsResponse = await base44.asServiceRole.functions.invoke('getLeadsFromSheetsForCSV', { lead_ids: leadIds });
      const raw = sheetsResponse.data.leads || [];
      if (raw.length > 0) {
        completeLeadData = raw.map(lead => {
          const filtered = {};
          Object.entries(lead).forEach(([k, v]) => { if (!SYSTEM_FIELDS.includes(k)) filtered[k] = v; });
          return filtered;
        });
        console.log('Lead data fetched from sheets:', completeLeadData.length);
      }
    } catch (err) {
      console.error('Failed to fetch from sheets, using snapshot:', err.message);
    }

    // Patch the existing order
    await base44.asServiceRole.entities.Order.update(order_id, {
      leads_purchased: leadIds,
      lead_data_snapshot: completeLeadData,
      lead_count: leadIds.length,
      download_log: [{
        timestamp: new Date().toISOString(),
        ip: 'server-webhook',
        user_agent: 'stripe-webhook-fulfillment'
      }]
    });

    // Create LeadSuppression records
    function getTierFromAge(ageInDays) {
      if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
      if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
      if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
      if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
      if (ageInDays >= 91) return 'tier5';
      return 'tier1';
    }

    for (const item of completeLeadData) {
      const tier = getTierFromAge(item.age_in_days || 1);
      try {
        await base44.asServiceRole.entities.LeadSuppression.create({
          lead_id: item.lead_id,
          tier,
          order_id: order_id,
          sale_date: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Suppression record may already exist for', item.lead_id, err.message);
      }
    }

    // Delete temp order if still around
    if (tempOrderId) {
      try {
        await base44.asServiceRole.entities.Order.delete(tempOrderId);
        console.log('Temp order deleted');
      } catch { /* already gone */ }
    }

    return Response.json({
      success: true,
      order_id,
      lead_count: leadIds.length,
      customer_email: order.customer_email
    });

  } catch (error) {
    console.error('fixEmptyOrder error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});