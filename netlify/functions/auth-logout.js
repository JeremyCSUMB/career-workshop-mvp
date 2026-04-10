/**
 * Auth Logout
 *
 * POST: Clears the session cookie by setting it with max-age=0,
 * effectively signing the user out.
 */

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Clear the session cookie with matching attributes from auth-callback
  const cookie = 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
    body: JSON.stringify({ success: true }),
  };
};
