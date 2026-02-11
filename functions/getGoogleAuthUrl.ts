import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { fromUrl } = await req.json();
    
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
    const redirectUri = `${Deno.env.get('APP_URL')}/api/functions/googleAuthCallback`;
    const state = JSON.stringify({ from_url: fromUrl || '/' });
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent('email profile')}&` +
      `state=${encodeURIComponent(state)}`;
    
    return Response.json({ url: googleAuthUrl });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});