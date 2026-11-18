import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user?.email) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { order_id } = await req.json();

    if (!order_id) {
      return Response.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Fetch the order using service role so we can inspect and delete it
    const order = await base44.asServiceRole.entities.Order.get(order_id);

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Only the order owner can cancel their own pending order, unless they're an admin
    const isAdmin = user.role === 'admin';
    if (order.customer_email !== user.email && !isAdmin) {
      return Response.json({ error: 'You can only cancel your own orders' }, { status: 403 });
    }

    // Only pending orders can be cancelled — completed orders have already been charged
    if (order.status !== 'pending') {
      return Response.json({ error: 'Only pending orders can be cancelled' }, { status: 400 });
    }

    // The Stripe session behind a pending order stays payable until it is expired.
    // Deleting the order first leaves a paid charge with no order to fulfil it, so
    // expire every open session for this order before removing it.
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });
    let sessionIds = order.stripe_session_id ? [order.stripe_session_id] : [];
    if (sessionIds.length === 0) {
      // Older pending orders have no stored session id — look through recent sessions.
      try {
        const recent = await stripe.checkout.sessions.list({ limit: 100 });
        sessionIds = recent.data.filter(s => s.client_reference_id === order_id).map(s => s.id);
      } catch (err) {
        console.warn('Checkout session lookup failed:', err.message);
      }
    }

    for (const sessionId of sessionIds) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // Never delete an order that has already been paid — the webhook still needs it.
        if (session.status === 'complete') {
          return Response.json({ error: 'This order has already been paid and is being processed.' }, { status: 409 });
        }
        if (session.status === 'open') {
          await stripe.checkout.sessions.expire(sessionId);
          console.log(`Expired Stripe session ${sessionId} for cancelled order ${order_id}`);
        }
      } catch (err) {
        if (err.code === 'resource_missing') {
          console.warn(`Stripe session ${sessionId} no longer exists, continuing cancel`);
          continue;
        }
        console.error(`Could not expire Stripe session ${sessionId}:`, err.message);
        return Response.json({ error: 'Could not cancel the payment session. Please try again.' }, { status: 502 });
      }
    }

    await base44.asServiceRole.entities.Order.delete(order_id);
    console.log(`Pending order ${order_id} cancelled by ${user.email}`);

    return Response.json({ success: true, order_id });
  } catch (error) {
    console.error('Error cancelling pending order:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});