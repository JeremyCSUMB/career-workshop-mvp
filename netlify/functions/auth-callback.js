/**
 * Auth Callback
 *
 * GET: Handles the OAuth 2.0 callback from Google.
 * Exchanges the authorization code for tokens, extracts the user profile,
 * creates a session JWT, sets it as an HTTP-only cookie, and redirects.
 */

const { signJwt } = require('./lib/jwt');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const code = event.queryStringParameters?.code;
  if (!code) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing authorization code' }),
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing Google OAuth credentials' }),
    };
  }

  // Build the redirect_uri — must match what auth-login used
  const host = event.headers.host || 'localhost:8888';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = isLocalhost ? 'http' : (event.headers['x-forwarded-proto'] || 'https');
  const redirectUri = `${protocol}://${host}/.netlify/functions/auth-callback`;

  // Exchange authorization code for tokens
  let tokenData;
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to exchange authorization code' }),
      };
    }
  } catch (err) {
    console.error('Token exchange error:', err);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to exchange authorization code' }),
    };
  }

  // Extract user profile from the Google ID token
  let name, email, picture;
  try {
    const idToken = tokenData.id_token;
    // Decode the JWT payload (second segment) without verification
    // Google's ID token is already validated by the token exchange
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString()
    );
    name = payload.name;
    email = payload.email;
    picture = payload.picture;
  } catch (err) {
    console.error('Failed to decode ID token:', err);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to extract user profile' }),
    };
  }

  // Create a session JWT
  const sessionToken = signJwt({ name, email, picture });

  // Store user profile in Netlify Blobs for the instructor dashboard
  try {
    const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });
    await store.setJSON(`user:${email}`, {
      name,
      email,
      picture,
      authenticatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Non-fatal — log but don't block the auth flow
    console.error('Failed to store user profile in blobs:', err);
  }

  // Determine redirect destination
  const state = event.queryStringParameters?.state;
  let redirectTo = '/interview';
  if (state) {
    // The state param contains the original path the student was trying to reach
    // e.g., "/interview?code=ABC123"
    redirectTo = state;
  }

  // Set session cookie and redirect
  const maxAge = 28800; // 8 hours in seconds
  const cookie = `session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

  return {
    statusCode: 302,
    headers: {
      Location: redirectTo,
      'Set-Cookie': cookie,
    },
    body: '',
  };
};
