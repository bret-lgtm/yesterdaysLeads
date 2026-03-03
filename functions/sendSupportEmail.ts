import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const { first_name, last_name, email, phone, message } = await req.json();

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
        from: 'Yesterday\'s Leads <onboarding@resend.dev>',
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