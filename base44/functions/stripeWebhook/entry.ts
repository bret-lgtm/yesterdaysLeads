import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe';
import { getTierNumFromAge, getSoldTierKeys } from '../../shared/tierSuppression.ts';

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

      // Check if order already exists for this payment_intent (prevent duplicate processing)
      // Only do this check when payment_intent is non-null (free/100%-off orders have null payment_intent)
      if (session.payment_intent) {
        const existingOrders = await base44.asServiceRole.entities.Order.filter({ 
          stripe_transaction_id: session.payment_intent 
        });
        
        if (existingOrders.length > 0) {
          console.log('Order already processed for payment_intent:', session.payment_intent);
          try { await base44.asServiceRole.entities.Order.delete(tempOrderId); } catch (err) {}
          return Response.json({ received: true, message: 'Already processed' });
        }
      }

      // Cross-session duplicate check: if a completed order already exists for same customer + same leads, skip
      const userEmailForCheck = session.customer_details?.email || session.customer_email;
      if (userEmailForCheck && tempOrderId) {
        try {
          const tempOrderData = await base44.asServiceRole.entities.Order.get(tempOrderId);
          const newLeadsSorted = (tempOrderData.leads_purchased || []).slice().sort().join(',');
          const recentCompleted = await base44.asServiceRole.entities.Order.filter({
            customer_email: userEmailForCheck,
            status: 'completed'
          });
          for (const existing of recentCompleted) {
            const existingLeadsSorted = (existing.leads_purchased || []).slice().sort().join(',');
            if (existingLeadsSorted === newLeadsSorted && existingLeadsSorted.length > 0) {
              console.warn(`Duplicate order detected! Customer ${userEmailForCheck} already has a completed order with the same ${existing.leads_purchased.length} leads (order ${existing.id}). Refunding duplicate payment_intent: ${session.payment_intent}`);
              // Auto-refund the duplicate charge
              try {
                await stripe.refunds.create({ payment_intent: session.payment_intent });
                console.log('Auto-refunded duplicate charge:', session.payment_intent);
              } catch (refundErr) {
                console.error('Failed to auto-refund duplicate:', refundErr.message);
              }
              try { await base44.asServiceRole.entities.Order.delete(tempOrderId); } catch (err) {}
              return Response.json({ received: true, message: 'Duplicate order auto-refunded' });
            }
          }
        } catch (err) {
          console.warn('Cross-session duplicate check failed, continuing:', err.message);
        }
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

        // The pending order can be removed while its Stripe session is still payable
        // (for example the customer cancelled checkout and the session was never
        // expired). The money has already been captured, so never drop the event:
        // record a recovery order so the charge shows up in the admin dashboard
        // instead of disappearing.
        const recoveryEmail = session.customer_details?.email || session.customer_email || metadata.user_email;
        try {
          const existingCustomer = recoveryEmail
            ? (await base44.asServiceRole.entities.Customer.filter({ email: recoveryEmail }))[0]
            : null;
          const recoveryOrder = await base44.asServiceRole.entities.Order.create({
            customer_id: existingCustomer?.id || 'pending',
            customer_email: recoveryEmail,
            customer_phone: session.customer_details?.phone || null,
            total_price: (session.amount_total || 0) / 100,
            lead_count: Number(metadata.lead_count) || 0,
            stripe_transaction_id: session.payment_intent,
            leads_purchased: [],
            lead_data_snapshot: [],
            status: 'processing',
            download_log: [{
              timestamp: new Date().toISOString(),
              ip: 'webhook-recovery',
              user_agent: `paid session ${session.id} had no pending order ${tempOrderId}`
            }]
          });
          console.error(`RECOVERY: paid session ${session.id} (${session.payment_intent}) had no pending order — created recovery order ${recoveryOrder.id} for ${recoveryEmail}`);
          return Response.json({ received: true, recovery_order_id: recoveryOrder.id });
        } catch (recoveryErr) {
          console.error('Recovery order creation failed:', recoveryErr.message);
          return Response.json({ error: 'Temp order missing and recovery failed', tempOrderId }, { status: 500 });
        }
      }

      const userEmail = tempOrder.customer_email || session.customer_details?.email || session.customer_email;
      const cartItemData = tempOrder.lead_data_snapshot;
      const referredBy = tempOrder.referred_by || null;

      console.log('User email:', userEmail);
      console.log('Cart items count:', cartItemData.length);

      // Use cart item data directly from snapshot - deduplicate by lead_id
      const seenLeadIds = new Set();
      let cartItems = cartItemData
        .map(item => ({
          id: item.id,
          lead_id: item.lead_id,
          lead_type: item.lead_type,
          lead_name: item.lead_name,
          state: item.state,
          zip_code: item.zip_code,
          age_in_days: item.age_in_days,
          price: item.price
        }))
        .filter(item => {
          if (seenLeadIds.has(item.lead_id)) return false;
          seenLeadIds.add(item.lead_id);
          return true;
        });
      
      if (cartItems.length !== cartItemData.length) {
        console.warn(`Deduped cart items: ${cartItemData.length} -> ${cartItems.length}`);
      }

      // Authoritative lead records: age and type used for tier suppression come from live
      // inventory, never from the stored snapshot.
      let authoritativeLeads;
      try {
        const authRes = await base44.asServiceRole.functions.invoke('getSupabaseLeadsForCSV', {
          lead_ids: cartItems.map(i => i.lead_id),
          internal_token: Deno.env.get('INTERNAL_FUNCTION_TOKEN')
        });
        if (!authRes?.data?.success) throw new Error(authRes?.data?.error || 'Lead lookup failed');
        authoritativeLeads = authRes.data.leads || [];
      } catch (err) {
        console.error('Webhook: authoritative lead lookup failed:', err.message);
        throw new Error(`Failed to verify lead data: ${err.message}`);
      }
      const authById = new Map();
      for (const lead of authoritativeLeads) {
        if (lead.id) authById.set(lead.id, lead);
        if (lead.external_id) authById.set(lead.external_id, lead);
      }
      cartItems = cartItems.map(item => {
        const lead = authById.get(item.lead_id);
        const authAge = lead ? Number(lead.age_in_days) : NaN;
        // Age 0 is a legitimate brand-new lead (uploaded today) — it prices and suppresses as tier 1.
        if (!lead || !Number.isFinite(authAge) || authAge < 0) {
          console.warn(`Webhook: ${item.lead_id} not verified in live inventory — tier checks skipped for it`);
          return { ...item, age_in_days: null };
        }
        return {
          ...item,
          lead_type: String(lead.lead_type || item.lead_type || '').toLowerCase().replace(/\s+/g, '_'),
          state: lead.state || item.state,
          zip_code: lead.zip_code || item.zip_code,
          age_in_days: Math.max(0, authAge)
        };
      });

      // Cross-order duplicate check: remove leads the customer already owns in prior orders
      const customerEmail = userEmail;
      const priorOrders = await base44.asServiceRole.entities.Order.filter({
        customer_email: customerEmail,
        status: 'completed'
      });
      const priorLeadIds = new Set();
      const priorExternalIds = new Set();
      for (const priorOrder of priorOrders) {
        // Legacy row-based IDs
        for (const lid of (priorOrder.leads_purchased || [])) {
          priorLeadIds.add(lid);
        }
        // Stable external_ids from snapshot
        for (const snap of (priorOrder.lead_data_snapshot || [])) {
          if (snap.external_id) priorExternalIds.add(snap.external_id);
        }
      }
      const crossOrderDupes = cartItems.filter(item => 
        priorLeadIds.has(item.lead_id) || priorExternalIds.has(item.external_id)
      );
      if (crossOrderDupes.length > 0) {
        console.warn(`Cross-order duplicates detected for ${customerEmail}: ${crossOrderDupes.map(i => i.lead_id).join(', ')} — removing from order`);
        const dupeIds = new Set(crossOrderDupes.map(i => i.lead_id));
        cartItems.splice(0, cartItems.length, ...cartItems.filter(i => !dupeIds.has(i.lead_id)));
      }

      // Tier-based suppression check: remove any leads whose current-age tier is already sold to another customer.
      // Only this order's leads are looked up (in batches) so every sale record is checked — a plain
      // list() silently caps at 5,000 rows, far below the suppression table's size.
      const tierLimitedLeadIds = cartItems
        .filter(item => item.age_in_days != null && getTierNumFromAge(item.age_in_days) <= 4)
        .map(item => item.lead_id);
      const soldTierKeys = await getSoldTierKeys(base44.asServiceRole.entities, tierLimitedLeadIds);
      const tierDupes = cartItems.filter(item => {
        if (item.age_in_days == null) return false; // unverified lead — its tier cannot be evaluated
        const tierNum = getTierNumFromAge(item.age_in_days);
        if (tierNum >= 5) return false; // Tier 5+ can be sold unlimited times
        const tierKey = `${item.lead_id}:tier${tierNum}`;
        return soldTierKeys.has(tierKey);
      });
      if (tierDupes.length > 0) {
        console.warn(`Tier-sold duplicates detected: ${tierDupes.map(i => `${i.lead_id}(tier${getTierNumFromAge(i.age_in_days)})`).join(', ')} — removing from order`);
        const tierDupeIds = new Set(tierDupes.map(i => i.lead_id));
        cartItems.splice(0, cartItems.length, ...cartItems.filter(i => !tierDupeIds.has(i.lead_id)));
      }

      // If ALL leads were stripped as duplicates, refund and abort
      if (cartItems.length === 0 && session.payment_intent) {
        console.warn(`All ${crossOrderDupes.length} leads were cross-order duplicates for ${customerEmail}. Auto-refunding.`);
        try {
          await stripe.refunds.create({ payment_intent: session.payment_intent });
          console.log('Auto-refunded all-duplicate order:', session.payment_intent);
        } catch (refundErr) {
          console.error('Failed to auto-refund all-duplicate order:', refundErr.message);
        }
        try { await base44.asServiceRole.entities.Order.delete(tempOrderId); } catch (_) {}
        return Response.json({ received: true, message: 'All leads were duplicates, payment refunded' });
      }

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
      } else {
        // Keep the customer's name in sync with the latest Stripe checkout name
        const sessionName = session.customer_details?.name;
        if (sessionName && sessionName !== customer.full_name) {
          const oldName = customer.full_name;
          await base44.asServiceRole.entities.Customer.update(customer.id, { full_name: sessionName });
          customer.full_name = sessionName;
          console.log(`Updated customer name from "${oldName}" to "${sessionName}" for ${userEmail}`);
        }
      }

      // Build the CSV snapshot from the authoritative records already fetched above
      const finalLeadIds = new Set(cartItems.map(item => item.lead_id));
      let completeLeadData = authoritativeLeads
        .filter(lead => finalLeadIds.has(lead.id) || finalLeadIds.has(lead.external_id))
        .map(lead => {
          const filtered = {};
          Object.entries(lead).forEach(([key, value]) => {
            // Exclude system/internal fields
            if (!['id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample'].includes(key)) {
              filtered[key] = value;
            }
          });
          return filtered;
        });

      console.log('Complete lead data prepared:', completeLeadData.length);

      console.log('Session total:', session.amount_total / 100);

      // Get coupon code from session discounts if any
      let usedCouponCode = null;
      if (session.total_details?.breakdown?.discounts?.length > 0) {
        try {
          const discountObj = session.total_details.breakdown.discounts[0];
          const promoCodeId = discountObj.discount?.promotion_code;
          if (promoCodeId) {
            const promoCode = await stripe.promotionCodes.retrieve(promoCodeId);
            usedCouponCode = promoCode.code?.toUpperCase();
          }
        } catch (err) {
          console.warn('Could not retrieve promo code:', err.message);
        }
      }

      // Create order - use cartItems.length for accurate lead count
      const order = await base44.asServiceRole.entities.Order.create({
        customer_id: customer.id,
        customer_email: userEmail,
        customer_phone: session.customer_details?.phone || null,
        total_price: session.amount_total / 100, // Convert from cents
        lead_count: cartItems.length,
        stripe_transaction_id: session.payment_intent,
        leads_purchased: cartItems.map(item => item.lead_id),
        lead_data_snapshot: completeLeadData,
        coupon_code: usedCouponCode,
        referred_by: referredBy,
        status: 'completed',
        download_log: [{
          timestamp: new Date().toISOString(),
          ip: 'server-webhook',
          user_agent: 'stripe-webhook-fulfillment'
        }]
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
          orderData: order,
          internal_token: Deno.env.get('INTERNAL_FUNCTION_TOKEN')
        });
      } catch (hubspotError) {
        console.error('Failed to sync to HubSpot:', hubspotError);
        // Don't fail the webhook if HubSpot sync fails
      }

      // Update Customer.suppression_list with all newly purchased lead IDs
      const newLeadIds = cartItems.map(item => item.lead_id);
      const updatedSuppressionList = [...new Set([...(customer.suppression_list || []), ...newLeadIds])];
      await base44.asServiceRole.entities.Customer.update(customer.id, {
        suppression_list: updatedSuppressionList
      });
      console.log(`Updated suppression_list to ${updatedSuppressionList.length} leads for ${userEmail}`);

      // Delete the temporary order
      await base44.asServiceRole.entities.Order.delete(tempOrderId);

      // Create lead suppression records for tier-based suppression
      // Determine tier for each lead based on age
      function getTierFromAge(ageInDays) {
        if (ageInDays >= 1 && ageInDays <= 3) return 'tier1';
        if (ageInDays >= 4 && ageInDays <= 14) return 'tier2';
        if (ageInDays >= 15 && ageInDays <= 30) return 'tier3';
        if (ageInDays >= 31 && ageInDays <= 90) return 'tier4';
        if (ageInDays >= 91 && ageInDays <= 180) return 'tier5';
        if (ageInDays >= 181 && ageInDays <= 365) return 'tier6';
        if (ageInDays >= 366) return 'tier7';
        return 'tier1';
      }

      for (const cartItem of cartItems) {
        if (cartItem.age_in_days == null) {
          console.warn(`Skipping suppression record for unverified lead ${cartItem.lead_id}`);
          continue;
        }
        const tier = getTierFromAge(cartItem.age_in_days);
        await base44.asServiceRole.entities.LeadSuppression.create({
          lead_id: cartItem.lead_id,
          tier: tier,
          order_id: order.id,
          sale_date: new Date().toISOString()
        });

        // Update Supabase tier status
        try {
          const sheetUpdateResponse = await base44.asServiceRole.functions.invoke('updateSupabaseTierStatus', {
            lead_id: cartItem.lead_id,
            tier: tier,
            internal_token: Deno.env.get('INTERNAL_FUNCTION_TOKEN')
          });
          console.log(`Tier update response for ${cartItem.lead_id} (${tier}):`, JSON.stringify(sheetUpdateResponse.data));
          if (!sheetUpdateResponse.data?.success) {
            console.error(`Tier update failed for ${cartItem.lead_id}:`, sheetUpdateResponse.data?.error);
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