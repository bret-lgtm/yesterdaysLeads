import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { order_id } = await req.json();
    if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });

    // Find the Stripe checkout session by client_reference_id
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    const session = sessions.data.find(s => s.client_reference_id === order_id || s.metadata?.temp_order_id === order_id);
    if (!session) return Response.json({ error: 'No Stripe session found for this order' }, { status: 404 });

    if (session.payment_status !== 'paid') {
      return Response.json({ error: `Session payment status is ${session.payment_status}, not paid` }, { status: 400 });
    }

    const tempOrder = await base44.asServiceRole.entities.Order.get(order_id);
    const userEmail = tempOrder.customer_email || session.customer_details?.email || session.customer_email;
    if (!userEmail) return Response.json({ error: 'No customer email found in order or Stripe session' }, { status: 400 });

    // Check if a completed order already exists for this payment_intent
    if (session.payment_intent) {
      const existing = await base44.asServiceRole.entities.Order.filter({ stripe_transaction_id: session.payment_intent });
      if (existing.length > 0) {
        // Already fulfilled — just delete the stuck temp order
        await base44.asServiceRole.entities.Order.delete(order_id);
        return Response.json({ success: true, message: 'Order was already fulfilled. Deleted stuck temp order.', completed_order_id: existing[0].id });
      }
    }

    const cartItemData = tempOrder.lead_data_snapshot || [];

    // Deduplicate by lead_id
    const seenLeadIds = new Set();
    const cartItems = cartItemData
      .map(item => ({ ...item, lead_id: item.lead_id || item.id }))
      .filter(item => {
        if (seenLeadIds.has(item.lead_id)) return false;
        seenLeadIds.add(item.lead_id);
        return true;
      });

    // Cross-order duplicate check
    const priorOrders = await base44.asServiceRole.entities.Order.filter({ customer_email: userEmail, status: 'completed' });
    const priorLeadIds = new Set();
    const priorExternalIds = new Set();
    for (const prior of priorOrders) {
      for (const lid of (prior.leads_purchased || [])) priorLeadIds.add(lid);
      for (const snap of (prior.lead_data_snapshot || [])) {
        if (snap.external_id) priorExternalIds.add(snap.external_id);
      }
    }
    const crossDupes = cartItems.filter(item => priorLeadIds.has(item.lead_id) || priorExternalIds.has(item.external_id));
    if (crossDupes.length > 0) {
      const dupeIds = new Set(crossDupes.map(i => i.lead_id));
      cartItems.splice(0, cartItems.length, ...cartItems.filter(i => !dupeIds.has(i.lead_id)));
    }

    // Tier suppression check
    function getTierNumFromAge(days) {
      if (days >= 1 && days <= 3) return 1;
      if (days >= 4 && days <= 14) return 2;
      if (days >= 15 && days <= 30) return 3;
      if (days >= 31 && days <= 90) return 4;
      return 5;
    }
    const allSuppression = await base44.asServiceRole.entities.LeadSuppression.list('', 50000);
    const soldTierKeys = new Set(allSuppression.map(r => `${r.lead_id}:${r.tier}`));
    const tierDupes = cartItems.filter(item => soldTierKeys.has(`${item.lead_id}:tier${getTierNumFromAge(item.age_in_days || 91)}`));
    if (tierDupes.length > 0) {
      const tierDupeIds = new Set(tierDupes.map(i => i.lead_id));
      cartItems.splice(0, cartItems.length, ...cartItems.filter(i => !tierDupeIds.has(i.lead_id)));
    }

    if (cartItems.length === 0) {
      if (session.payment_intent) {
        await stripe.refunds.create({ payment_intent: session.payment_intent });
      }
      await base44.asServiceRole.entities.Order.delete(order_id);
      return Response.json({ success: true, message: 'All leads were duplicates. Refunded and deleted.' });
    }

    // Get or create customer
    let customer = (await base44.asServiceRole.entities.Customer.filter({ email: userEmail }))[0];
    if (!customer) {
      const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
      customer = await base44.asServiceRole.entities.Customer.create({
        user_id: users[0]?.id,
        email: userEmail,
        full_name: session.customer_details?.name || userEmail,
        suppression_list: []
      });
    }

    // Fetch complete lead data
    const leadIds = cartItems.map(item => item.lead_id);
    const sheetsResponse = await base44.asServiceRole.functions.invoke('getSupabaseLeadsForCSV', { lead_ids: leadIds });
    let completeLeadData = (sheetsResponse.data.leads || []).map(lead => {
      const filtered = {};
      Object.entries(lead).forEach(([key, value]) => {
        if (!['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'].includes(key)) {
          filtered[key] = value;
        }
      });
      return filtered;
    });

    // Get coupon code if any
    let usedCouponCode = null;
    if (session.total_details?.breakdown?.discounts?.length > 0) {
      try {
        const promoCodeId = session.total_details.breakdown.discounts[0].discount?.promotion_code;
        if (promoCodeId) {
          const promoCode = await stripe.promotionCodes.retrieve(promoCodeId);
          usedCouponCode = promoCode.code?.toUpperCase();
        }
      } catch (_) {}
    }

    // Create the completed order
    const order = await base44.asServiceRole.entities.Order.create({
      customer_id: customer.id,
      customer_email: userEmail,
      total_price: session.amount_total / 100,
      lead_count: cartItems.length,
      stripe_transaction_id: session.payment_intent,
      leads_purchased: cartItems.map(item => item.lead_id),
      lead_data_snapshot: completeLeadData,
      coupon_code: usedCouponCode,
      status: 'completed',
      download_log: [{ timestamp: new Date().toISOString(), ip: 'server-recovery', user_agent: 'recoverStuckOrder' }]
    });

    // Sync to HubSpot
    try {
      await base44.asServiceRole.functions.invoke('syncOrderToHubspot', { orderData: order });
    } catch (_) {}

    // Update customer suppression list
    const newLeadIds = cartItems.map(item => item.lead_id);
    const updatedSuppressionList = [...new Set([...(customer.suppression_list || []), ...newLeadIds])];
    await base44.asServiceRole.entities.Customer.update(customer.id, { suppression_list: updatedSuppressionList });

    // Delete the stuck temp order
    await base44.asServiceRole.entities.Order.delete(order_id);

    // Create suppression records + update sheet tier status
    function getTierFromAge(ageInDays) {
      if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
      if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
      if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
      if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
      return 'tier5';
    }

    for (const cartItem of cartItems) {
      const tier = getTierFromAge(cartItem.age_in_days || 1);
      await base44.asServiceRole.entities.LeadSuppression.create({
        lead_id: cartItem.lead_id,
        tier,
        order_id: order.id,
        sale_date: new Date().toISOString()
      });
      try {
        await base44.asServiceRole.functions.invoke('updateSupabaseTierStatus', { lead_id: cartItem.lead_id, tier });
      } catch (_) {}
    }

    // Clear cart items
    for (const itemData of cartItemData) {
      try { await base44.asServiceRole.entities.CartItem.delete(itemData.id); } catch (_) {}
    }

    return Response.json({
      success: true,
      message: 'Order recovered and fulfilled',
      completed_order_id: order.id,
      customer_email: userEmail,
      lead_count: cartItems.length,
      total_price: session.amount_total / 100
    });

  } catch (error) {
    console.error('recoverStuckOrder error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});