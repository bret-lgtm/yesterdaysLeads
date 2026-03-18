import Stripe from 'npm:stripe';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { payment_intent_id, refund_amount_cents, reason } = await req.json();

    if (!payment_intent_id || !refund_amount_cents) {
      return Response.json({ error: 'Missing payment_intent_id or refund_amount_cents' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
      apiVersion: '2023-10-16'
    });

    const refund = await stripe.refunds.create({
      payment_intent: payment_intent_id,
      amount: refund_amount_cents,
      reason: 'fraudulent', // Using 'fraudulent' which maps to "incorrect charge" in Stripe
      metadata: {
        reason: reason || 'Pricing correction',
        base44_app_id: Deno.env.get("BASE44_APP_ID")
      }
    });

    console.log('Refund created:', refund.id, 'Amount:', refund.amount, 'Status:', refund.status);

    return Response.json({ 
      success: true,
      refund_id: refund.id,
      amount_refunded: refund.amount / 100,
      status: refund.status
    });

  } catch (error) {
    console.error('Refund error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});