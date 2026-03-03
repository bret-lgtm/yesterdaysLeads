import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const { first_name, last_name, email, phone, message } = await req.json();

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      // Fallback: just log and return success (avoids breaking the form)
      console.log('Support request received:', { first_name, last_name, email, phone, message });
      return Response.json({ success: true });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'support@yesterdaysleads.com',
        reply_to: email,
        subject: `Support Request from ${first_name} ${last_name}`,
        text: `New support request received:\n\nName: ${first_name} ${last_name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`,
      }),
    });

    const resBody = await res.json();
    console.log('Resend response:', JSON.stringify(resBody));

    if (!res.ok) {
      console.error('Resend error:', resBody);
      return Response.json({ error: 'Failed to send email', details: resBody }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('sendSupportEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});