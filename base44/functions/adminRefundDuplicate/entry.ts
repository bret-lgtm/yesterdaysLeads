import Stripe from 'npm:stripe';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });

    const { payment_intent_id, order_id, reason } = await req.json();

    if (!payment_intent_id || !order_id) {
      return Response.json({ error: 'Missing payment_intent_id or order_id' }, { status: 400 });
    }

    // Issue full refund on Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment_intent_id,
      reason: 'duplicate',
      metadata: {
        reason: reason || 'Duplicate charge',
        order_id,
        base44_app_id: Deno.env.get("BASE44_APP_ID")
      }
    });

    console.log('Refund created:', refund.id, 'Amount:', refund.amount, 'Status:', refund.status);

    // Mark order as refunded
    await base44.asServiceRole.entities.Order.update(order_id, { status: 'refunded' });
    console.log('Order marked as refunded:', order_id);

    return Response.json({
      success: true,
      refund_id: refund.id,
      amount_refunded: refund.amount / 100,
      status: refund.status
    });

  } catch (error) {
    console.error('adminRefundDuplicate error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});