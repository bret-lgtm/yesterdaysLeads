import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id } = await req.json();

    if (!order_id) {
      return Response.json({ error: 'order_id required' }, { status: 400 });
    }

    // Capture IP and user agent from request headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip') 
      || req.headers.get('x-real-ip') 
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const order = await base44.asServiceRole.entities.Order.get(order_id);
    const existingLog = order.download_log || [];

    const newEntry = {
      timestamp: new Date().toISOString(),
      ip,
      user_agent: userAgent
    };

    await base44.asServiceRole.entities.Order.update(order_id, {
      download_log: [...existingLog, newEntry]
    });

    console.log(`Download logged for order ${order_id} from IP ${ip}`);
    return Response.json({ success: true });

  } catch (error) {
    console.error('logDownload error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});