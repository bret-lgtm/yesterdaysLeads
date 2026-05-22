import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email } = await req.json();
    if (!email) return Response.json({ error: 'email required' }, { status: 400 });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });

    // Search for customers by email
    const customers = await stripe.customers.list({ email, limit: 5 });
    
    const results = [];
    for (const customer of customers.data) {
      // Get payment intents for this customer
      const paymentIntents = await stripe.paymentIntents.list({ customer: customer.id, limit: 10 });
      for (const pi of paymentIntents.data) {
        results.push({
          customer_id: customer.id,
          customer_email: customer.email,
          payment_intent: pi.id,
          amount: pi.amount / 100,
          status: pi.status,
          created: new Date(pi.created * 1000).toISOString(),
          metadata: pi.metadata
        });
      }

      // Also search checkout sessions
      const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 10 });
      for (const s of sessions.data) {
        results.push({
          type: 'checkout_session',
          session_id: s.id,
          payment_intent: s.payment_intent,
          amount: s.amount_total / 100,
          status: s.status,
          created: new Date(s.created * 1000).toISOString(),
          metadata: s.metadata,
          discounts: s.total_details
        });
      }
    }

    // Also search by email in checkout sessions directly
    const sessionSearch = await stripe.checkout.sessions.list({ limit: 100 });
    const emailSessions = sessionSearch.data.filter(s => 
      s.customer_details?.email?.toLowerCase() === email.toLowerCase()
    );
    
    for (const s of emailSessions) {
      if (!results.find(r => r.session_id === s.id)) {
        results.push({
          type: 'checkout_session_direct',
          session_id: s.id,
          payment_intent: s.payment_intent,
          amount: s.amount_total / 100,
          status: s.status,
          created: new Date(s.created * 1000).toISOString(),
          metadata: s.metadata,
          discounts: s.total_details
        });
      }
    }

    return Response.json({ results, customer_count: customers.data.length });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});