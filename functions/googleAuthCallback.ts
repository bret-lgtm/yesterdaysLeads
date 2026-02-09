import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code) {
      return new Response('Missing authorization code', { status: 400 });
    }

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
    const redirectUri = 'https://yesterdaysleads.com/api/functions/googleAuthCallback';

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();
    
    if (!tokens.access_token) {
      console.error('Token exchange failed:', tokens);
      console.error('Redirect URI used:', redirectUri);
      console.error('Client ID:', clientId);
      return new Response(`Failed to get access token: ${JSON.stringify(tokens)}`, { status: 400 });
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    
    const userInfo = await userInfoResponse.json();
    
    if (!userInfo.email) {
      return new Response('Failed to get user email', { status: 400 });
    }

    // Initialize Base44 client
    const base44 = createClientFromRequest(req);
    
    // Check if user exists in Base44, if not invite them
    let userExists = false;
    try {
      const existingUsers = await base44.asServiceRole.entities.User.filter({ email: userInfo.email });
      
      if (existingUsers.length === 0) {
        console.log('Inviting new user:', userInfo.email);
        await base44.asServiceRole.users.inviteUser(userInfo.email, 'user');
        console.log('User invited - they will receive welcome email');
      } else {
        console.log('User already exists:', userInfo.email);
        userExists = true;
      }
    } catch (error) {
      console.error('Error handling user:', error);
      return new Response(`User setup failed: ${error.message}`, { status: 500 });
    }
    
    // Parse state to get redirect URL
    let redirectUrl = '/';
    try {
      if (state) {
        const stateData = JSON.parse(state);
        redirectUrl = stateData.from_url || '/';
      }
    } catch (e) {
      console.error('Failed to parse state:', e);
    }

    // Redirect back to app with message
    const messageParam = userExists ? 'existing' : 'new';
    const finalUrl = `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}google_auth=success&type=${messageParam}&email=${encodeURIComponent(userInfo.email)}`;
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': finalUrl
      }
    });
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(`Authentication failed: ${error.message}`, { status: 500 });
  }
});