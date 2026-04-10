/**
 * Auth Session
 *
 * GET: Checks if the user is authenticated by verifying the session cookie JWT.
 * Returns the user profile if authenticated, or 401 if not.
 */

const { verifyJwt } = require('./lib/jwt');

/**
 * Parse cookies from the Cookie header string.
 * Returns an object mapping cookie names to values.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    if (name) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });
  return cookies;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const cookies = parseCookies(event.headers.cookie);
  const sessionToken = cookies.session;

  if (!sessionToken) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: false }),
    };
  }

  try {
    const payload = verifyJwt(sessionToken);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authenticated: true,
        user: {
          name: payload.name,
          email: payload.email,
          picture: payload.picture,
        },
      }),
    };
  } catch (err) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: false }),
    };
  }
};
