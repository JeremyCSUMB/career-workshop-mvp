/**
 * Auth Login
 *
 * GET: Redirects the user to Google's OAuth 2.0 consent screen.
 * Accepts an optional 'redirect' query param, passed as the OAuth state parameter.
 */

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing GOOGLE_CLIENT_ID' }),
    };
  }

  // Build the redirect_uri pointing to our callback function
  const host = event.headers.host || 'localhost:8888';
  const protocol = event.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${protocol}://${host}/.netlify/functions/auth-callback`;

  // Preserve the original redirect URL (e.g., /interview?code=ABC) as OAuth state
  const redirectParam = event.queryStringParameters?.redirect || '';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    access_type: 'online',
    prompt: 'select_account',
  });

  if (redirectParam) {
    params.set('state', redirectParam);
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
    },
    body: '',
  };
};
