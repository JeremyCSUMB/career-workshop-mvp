const { clearDashboardCookie } = require('./lib/dashboard-auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearDashboardCookie(event),
    },
    body: JSON.stringify({ success: true }),
  };
};
