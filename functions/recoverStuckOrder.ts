import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { order_id, payment_intent_id } = await req.json();
    if (!order_id || !payment_intent_id) {
      return Response.json({ error: 'order_id and payment_intent_id required' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });

    // Fetch payment intent from Stripe to get customer email and amount
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    console.log('Payment intent status:', pi.status);
    console.log('Payment intent amount:', pi.amount);

    if (pi.status !== 'succeeded') {
      return Response.json({ error: `Payment intent status is '${pi.status}', not succeeded` }, { status: 400 });
    }

    // Get customer email from PI
    let customerEmail = pi.receipt_email || pi.metadata?.user_email;
    if (!customerEmail && pi.customer) {
      const stripeCustomer = await stripe.customers.retrieve(pi.customer);
      customerEmail = stripeCustomer.email;
    }
    // Try to get from the checkout session
    if (!customerEmail) {
      const sessions = await stripe.checkout.sessions.list({ payment_intent: payment_intent_id, limit: 1 });
      if (sessions.data.length > 0) {
        customerEmail = sessions.data[0].customer_details?.email || sessions.data[0].customer_email;
      }
    }

    if (!customerEmail) {
      return Response.json({ error: 'Could not determine customer email from Stripe' }, { status: 400 });
    }

    console.log('Customer email:', customerEmail);

    // Fetch stuck order
    const stuckOrder = await base44.asServiceRole.entities.Order.get(order_id);
    const leadIds = stuckOrder.leads_purchased;
    const totalPrice = pi.amount / 100;

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
      console.log('Lead data fetched:', completeLeadData.length);
    } catch (err) {
      console.error('Failed to fetch lead data:', err.message);
      completeLeadData = stuckOrder.lead_data_snapshot || [];
    }

    // Get or create customer record
    let customer = (await base44.asServiceRole.entities.Customer.filter({ email: customerEmail }))[0];
    if (!customer) {
      customer = await base44.asServiceRole.entities.Customer.create({
        email: customerEmail,
        full_name: customerEmail,
        suppression_list: []
      });
    }

    // Create the completed order
    const order = await base44.asServiceRole.entities.Order.create({
      customer_id: customer.id,
      customer_email: customerEmail,
      total_price: totalPrice,
      lead_count: leadIds.length,
      stripe_transaction_id: payment_intent_id,
      leads_purchased: leadIds,
      lead_data_snapshot: completeLeadData,
      status: 'completed'
    });

    console.log('Recovered order created:', order.id);

    // Delete the stuck order
    await base44.asServiceRole.entities.Order.delete(order_id);
    console.log('Stuck order deleted:', order_id);

    return Response.json({ success: true, new_order_id: order.id, customer_email: customerEmail, lead_count: leadIds.length });

  } catch (error) {
    console.error('Recovery error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});