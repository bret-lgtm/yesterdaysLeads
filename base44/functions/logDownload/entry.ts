import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id } = await req.json();

    console.log('logDownload called, order_id:', order_id);

    if (!order_id) {
      return Response.json({ error: 'order_id required' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const order = await base44.asServiceRole.entities.Order.get(order_id);
    const existingLog = order.download_log || [];

    await base44.asServiceRole.entities.Order.update(order_id, {
      download_log: [...existingLog, {
        timestamp: new Date().toISOString(),
        ip,
        user_agent: userAgent
      }]
    });

    console.log('logDownload SUCCESS, order:', order_id, 'IP:', ip, 'total downloads:', existingLog.length + 1);
    return Response.json({ success: true, total_downloads: existingLog.length + 1 });

  } catch (error) {
    console.error('logDownload ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});