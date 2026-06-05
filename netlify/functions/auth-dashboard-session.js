const { verifyDashboardAuth } = require('./lib/dashboard-auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const authenticated = verifyDashboardAuth(event);
  return {
    statusCode: authenticated ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authenticated }),
  };
};
