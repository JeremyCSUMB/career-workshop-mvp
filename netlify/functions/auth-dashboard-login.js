const { createDashboardCookie, getDashboardPassword } = require('./lib/dashboard-auth');

function json(statusCode, data, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON in request body' });
  }

  try {
    if (body.password !== getDashboardPassword()) {
      return json(401, { error: 'Incorrect password' });
    }
    return json(200, { authenticated: true }, { 'Set-Cookie': createDashboardCookie(event) });
  } catch (error) {
    console.error('Dashboard login error:', error.message);
    return json(500, { error: 'Dashboard login is not configured' });
  }
};
