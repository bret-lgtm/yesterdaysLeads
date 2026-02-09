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
    
    // Check if user exists, if not create them
    let user;
    try {
      const existingUsers = await base44.asServiceRole.entities.User.filter({ email: userInfo.email });
      
      if (existingUsers.length === 0) {
        // Create new user
        user = await base44.asServiceRole.entities.User.create({
          email: userInfo.email,
          full_name: userInfo.name || userInfo.email,
          role: 'user'
        });
      } else {
        user = existingUsers[0];
      }
    } catch (error) {
      console.error('Error handling user:', error);
      return new Response(`User creation failed: ${error.message}`, { status: 500 });
    }

    // Ensure user exists or is invited
    try {
      await base44.users.inviteUser(userInfo.email, 'user');
    } catch (e) {
      // User might already exist, that's fine
      console.log('User invite skipped:', e.message);
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

    // Store Google auth info and redirect to complete login
    return new Response(`
      <html>
        <body>
          <script>
            sessionStorage.setItem('google_oauth_email', '${userInfo.email}');
            sessionStorage.setItem('google_oauth_name', '${userInfo.name || userInfo.email}');
            window.location.href = '${redirectUrl}?google_auth=success';
          </script>
        </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(`Authentication failed: ${error.message}`, { status: 500 });
  }
});