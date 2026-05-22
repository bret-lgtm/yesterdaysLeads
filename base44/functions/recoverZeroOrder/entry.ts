import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe';

// Recovery for orders where total was $0 (100% coupon) - no payment intent exists
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return Response.json({ error: 'session_id required' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    console.log('Session status:', session.status);
    console.log('Session amount:', session.amount_total);
    console.log('Session metadata:', JSON.stringify(session.metadata));

    if (session.status !== 'complete') {
      return Response.json({ error: 'Session is not complete', status: session.status }, { status: 400 });
    }

    const customerEmail = session.customer_details?.email || session.metadata?.user_email;
    if (!customerEmail) {
      return Response.json({ error: 'No customer email found' }, { status: 400 });
    }

    // Check if order already exists for this session
    const existing = await base44.asServiceRole.entities.Order.filter({ stripe_transaction_id: session_id });
    if (existing.length > 0) {
      return Response.json({ message: 'Order already exists', order_id: existing[0].id });
    }

    const metadata = session.metadata || {};
    let tempOrderId = metadata.temp_order_id;
    console.log('Temp order ID:', tempOrderId);

    // Get lead data from temp order
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

    // If temp order is gone, try to find a pending order for this customer with the same lead count
    if (leadIds.length === 0) {
      const leadCountFromMeta = parseInt(metadata.lead_count || '0');
      if (leadCountFromMeta > 0) {
        const pendingOrders = await base44.asServiceRole.entities.Order.filter({ 
          customer_email: customerEmail, 
          status: 'pending' 
        });
        const match = pendingOrders.find(o => o.lead_count === leadCountFromMeta || (o.leads_purchased || []).length === leadCountFromMeta);
        if (match) {
          leadIds = match.leads_purchased || [];
          leadDataSnapshot = match.lead_data_snapshot || [];
          console.log('Recovered lead data from pending order:', match.id, 'leads:', leadIds.length);
          // Store the pending order id to delete later
          tempOrderId = match.id;
        }
      }
    }

    if (leadIds.length === 0) {
      return Response.json({
        error: 'Temp order is gone and no matching pending order found. Manual recovery needed.',
        session_id,
        customer_email: customerEmail,
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
      console.error('Failed to fetch from sheets, using snapshot:', err.message);
      completeLeadData = leadDataSnapshot;
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

    const couponCode = metadata.coupon_code || 'growth6';

    // Create the completed order (use session_id as transaction ID since no payment intent)
    const order = await base44.asServiceRole.entities.Order.create({
      customer_id: customer.id,
      customer_email: customerEmail,
      total_price: session.amount_total / 100, // $0
      lead_count: leadIds.length,
      stripe_transaction_id: session_id,
      leads_purchased: leadIds,
      lead_data_snapshot: completeLeadData,
      coupon_code: couponCode,
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

    // Delete temp order
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
      total: session.amount_total / 100,
      coupon_used: couponCode
    });

  } catch (error) {
    console.error('Recovery error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});