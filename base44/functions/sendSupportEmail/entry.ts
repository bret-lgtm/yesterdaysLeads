import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// This form is deliberately open to visitors who are not logged in, so it is
// throttled per email and per IP instead. Isolates are recycled, so this is a
// speed bump against spam rather than a hard quota.
const recentHits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const tooManyHits = (key, limit) => {
  const now = Date.now();
  const hits = (recentHits.get(key) || []).filter(t => now - t < WINDOW_MS);
  hits.push(now);
  recentHits.set(key, hits);
  return hits.length > limit;
};

Deno.serve(async (req) => {
  try {
    const { first_name, last_name, email, phone, message } = await req.json().catch(() => ({}));

    if (!email || !message) {
      return Response.json({ error: 'Email and message are required' }, { status: 400 });
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || 'unknown';

    if (tooManyHits(`email:${String(email).toLowerCase()}`, 3) || tooManyHits(`ip:${ip}`, 8)) {
      console.warn(`sendSupportEmail throttled for ${ip} / ${email}`);
      return Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Yesterday\'s Leads <support@yesterdaysleads.com>',
        to: ['support@yesterdaysleads.com'],
        reply_to: email,
        subject: `Support Request from ${first_name} ${last_name}`,
        text: `New support request received:\n\nName: ${first_name} ${last_name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`,
      }),
    });

    clearTimeout(timeout);

    const resBody = await res.json();
    console.log('Resend response status:', res.status, JSON.stringify(resBody));

    if (!res.ok) {
      console.error('Resend error:', resBody);
      return Response.json({ error: resBody?.message || 'Failed to send email' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('sendSupportEmail error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});