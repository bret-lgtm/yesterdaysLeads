import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });
    console.log('Using Stripe key:', Deno.env.get("STRIPE_SECRET_KEY")?.substring(0, 7));
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const { cartItems: rawCartItems, customerEmail, couponCode } = await req.json();

    if (!rawCartItems || rawCartItems.length === 0) {
      return Response.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // Block check — reject checkout if customer is flagged as blocked
    const emailToCheck = user?.email || customerEmail;
    if (emailToCheck) {
      const customers = await base44.asServiceRole.entities.Customer.filter({ email: emailToCheck });
      if (customers[0]?.is_blocked) {
        console.warn(`Blocked customer attempted checkout: ${emailToCheck}`);
        return Response.json({ error: 'Your account has been suspended. Please contact support.' }, { status: 403 });
      }
    }

    // Deduplicate by lead_id FIRST before any pricing or Stripe line item calculations
    const seenLeadIds = new Set();
    const cartItems = rawCartItems.filter(item => {
      if (seenLeadIds.has(item.lead_id)) return false;
      seenLeadIds.add(item.lead_id);
      return true;
    });
    if (cartItems.length !== rawCartItems.length) {
      console.warn(`Deduped cart at checkout creation: ${rawCartItems.length} -> ${cartItems.length} items`);
    }

    // Group cart items by lead_type + price to create consolidated line items (Stripe has a 100 line item limit)
    const lineItemMap = {};
    for (const item of cartItems) {
      const key = `${item.lead_type}__${item.price}`;
      if (!lineItemMap[key]) {
        lineItemMap[key] = {
          lead_type: item.lead_type,
          price: item.price,
          count: 0
        };
      }
      lineItemMap[key].count++;
    }

    const lineItems = Object.values(lineItemMap).map(group => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${group.lead_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Leads`,
          description: `$${group.price.toFixed(2)} each × ${group.count} leads`
        },
        unit_amount: Math.round(group.price * 100)
      },
      quantity: group.count
    }));

    // Get app URL for redirect — use origin only (strips path, query, trailing slash)
    const rawUrl = req.headers.get('origin') || req.headers.get('referer') || Deno.env.get('APP_URL');
    if (!rawUrl) {
      return Response.json({ error: 'Invalid app configuration' }, { status: 500 });
    }
    let appUrl;
    try {
      appUrl = new URL(rawUrl).origin;
    } catch {
      appUrl = rawUrl.split('?')[0].replace(/\/$/, '');
    }
    const successUrl = `${appUrl}/CheckoutSuccess?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/Checkout`;

    // Calculate subtotal first
    const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);

    // Validate and get discount info if coupon code provided
    let discountInfo = null;
    if (couponCode) {
      try {
        // Look up promotion codes by coupon code name
        const promos = await stripe.promotionCodes.list({ 
          code: couponCode,
          limit: 1,
          active: true
        });

        if (promos.data.length > 0) {
          const promo = promos.data[0];
          const coupon = promo.coupon;
          
          if (coupon.percent_off) {
            discountInfo = {
              type: 'percent',
              value: coupon.percent_off,
              amount: Math.round(subtotal * coupon.percent_off / 100 * 100) / 100
            };
          } else if (coupon.amount_off) {
            discountInfo = {
              type: 'fixed',
              value: coupon.amount_off / 100,
              amount: coupon.amount_off / 100
            };
          }
        }
      } catch (couponError) {
        console.error('Invalid coupon code:', couponCode, couponError.message);
        // Continue without coupon
      }
    }

    // Calculate final total
    const finalTotal = discountInfo ? Math.round((subtotal - discountInfo.amount) * 100) / 100 : subtotal;

    // If total is free, fulfill order directly without Stripe (mirrors webhook flow)
    if (finalTotal <= 0) {
      const freeEmail = user?.email || customerEmail;
      const leadIds = cartItems.map(item => item.lead_id);

      // Fetch full lead data from Google Sheets
      let completeLeadData = [];
      try {
        const sheetsResponse = await base44.asServiceRole.functions.invoke('getLeadsFromSheetsForCSV', { lead_ids: leadIds });
        completeLeadData = (sheetsResponse.data.leads || []).map(lead => {
          const filtered = {};
          Object.entries(lead).forEach(([key, value]) => {
            if (!['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'].includes(key)) {
              filtered[key] = value;
            }
          });
          return filtered;
        });
        console.log('Free order: fetched full lead data, count:', completeLeadData.length);
      } catch (err) {
        console.error('Free order: failed to fetch lead data:', err.message);
        throw new Error(`Failed to fetch lead data from sheets: ${err.message}`);
      }

      // Get or create customer record
      let customer = (await base44.asServiceRole.entities.Customer.filter({ email: freeEmail }))[0];
      if (!customer) {
        customer = await base44.asServiceRole.entities.Customer.create({
          email: freeEmail,
          full_name: freeEmail,
          suppression_list: []
        });
      }

      // Create the order
      const freeOrder = await base44.asServiceRole.entities.Order.create({
        customer_id: customer.id,
        customer_email: freeEmail,
        total_price: 0,
        lead_count: cartItems.length,
        stripe_transaction_id: 'free_order',
        leads_purchased: leadIds,
        lead_data_snapshot: completeLeadData,
        coupon_code: couponCode || null,
        status: 'completed'
      });
      console.log('Free order created:', freeOrder.id);

      // Create suppression records
      function getTierFromAge(ageInDays) {
        if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
        if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
        if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
        if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
        return 'tier5';
      }
      for (const item of cartItems) {
        await base44.asServiceRole.entities.LeadSuppression.create({
          lead_id: item.lead_id,
          tier: getTierFromAge(item.age_in_days || 1),
          order_id: freeOrder.id,
          sale_date: new Date().toISOString()
        });
        try {
          await base44.asServiceRole.functions.invoke('updateSheetTierStatus', {
            lead_id: item.lead_id,
            tier: getTierFromAge(item.age_in_days || 1)
          });
        } catch (err) {
          console.error(`Free order: sheet update failed for ${item.lead_id}:`, err.message);
        }
      }

      // Delete cart items from database
      const cartItemsInDb = await base44.asServiceRole.entities.CartItem.filter({ user_email: freeEmail });
      for (const dbItem of cartItemsInDb) {
        try { await base44.asServiceRole.entities.CartItem.delete(dbItem.id); } catch (_) {}
      }

      return Response.json({ 
        sessionId: null,
        url: null,
        discountInfo,
        subtotal,
        finalTotal,
        freeOrder: true,
        orderId: freeOrder.id
      });
    }

    // Check if a pending order already exists for this customer with the same leads (prevent duplicate sessions)
    const customerEmailForCheck = user?.email || customerEmail;
    if (customerEmailForCheck) {
      const existingPending = await base44.asServiceRole.entities.Order.filter({
        customer_email: customerEmailForCheck,
        status: 'pending'
      });
      const sortedNewLeads = cartItems.map(i => i.lead_id).sort().join(',');
      for (const pending of existingPending) {
        const sortedExisting = (pending.leads_purchased || []).sort().join(',');
        if (sortedExisting === sortedNewLeads && pending.stripe_transaction_id !== 'pending') {
          // Try to retrieve the existing Stripe session
          try {
            const sessions = await stripe.checkout.sessions.list({ limit: 10 });
            const match = sessions.data.find(s => s.client_reference_id === pending.id && s.status === 'open');
            if (match) {
              console.log('Reusing existing checkout session:', match.id, 'for pending order:', pending.id);
              return Response.json({ sessionId: match.id, url: match.url, discountInfo, subtotal, finalTotal });
            }
          } catch (e) {
            console.warn('Could not retrieve existing session, will create new one:', e.message);
          }
        }
      }
    }

    // Create temporary order and Stripe session for paid orders
    const tempOrder = await base44.asServiceRole.entities.Order.create({
      customer_id: 'pending',
      customer_email: user?.email || customerEmail,
      total_price: subtotal,
      lead_count: cartItems.length,
      stripe_transaction_id: 'pending',
      leads_purchased: cartItems.map(item => item.lead_id),
      lead_data_snapshot: cartItems,
      status: 'pending'
    });

    const checkoutConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user?.email || customerEmail,
      client_reference_id: tempOrder.id,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        user_email: user?.email || customerEmail,
        lead_count: cartItems.length.toString(),
        temp_order_id: tempOrder.id
      },
      allow_promotion_codes: true
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create(checkoutConfig);
    } catch (stripeError) {
      // If coupon is invalid, try again without it
      if (couponCode && stripeError.type === 'StripeInvalidRequestError') {
        console.error('Coupon validation failed:', couponCode);
        delete checkoutConfig.discounts;
        session = await stripe.checkout.sessions.create(checkoutConfig);
        // Return success but notify about invalid coupon
        return Response.json({ 
          sessionId: session.id,
          url: session.url,
          warning: 'Coupon code was invalid and was not applied'
        });
      }
      throw stripeError;
    }

    return Response.json({ 
      sessionId: session.id,
      url: session.url,
      discountInfo,
      subtotal,
      finalTotal
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});