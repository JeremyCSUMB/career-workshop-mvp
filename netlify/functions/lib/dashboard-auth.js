const jwt = require('jsonwebtoken');
const { parseCookies } = require('./cookies');

const DASH_COOKIE = 'dashboard_session';
const MAX_AGE_SECONDS = 8 * 60 * 60;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('Missing SESSION_SECRET environment variable');
  return secret;
}

function getDashboardPassword() {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) throw new Error('Missing DASHBOARD_PASSWORD environment variable');
  return password;
}

function isLocalhost(event) {
  const host = event.headers.host || '';
  return host.includes('localhost') || host.includes('127.0.0.1');
}

function cookieAttributes(event, maxAge) {
  const secure = isLocalhost(event) ? '' : '; Secure';
  return `HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function createDashboardToken() {
  return jwt.sign({ dashboard: true }, getSecret(), { expiresIn: MAX_AGE_SECONDS });
}

function createDashboardCookie(event) {
  return `${DASH_COOKIE}=${createDashboardToken()}; ${cookieAttributes(event, MAX_AGE_SECONDS)}`;
}

function clearDashboardCookie(event) {
  return `${DASH_COOKIE}=; ${cookieAttributes(event, 0)}`;
}

function verifyDashboardAuth(event) {
  const cookies = parseCookies(event.headers.cookie);
  const token = cookies[DASH_COOKIE];
  if (!token) return false;
  try {
    const payload = jwt.verify(token, getSecret());
    return payload?.dashboard === true;
  } catch {
    return false;
  }
}

function unauthorized() {
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Dashboard authentication required' }),
  };
}

function requireDashboardAuth(event) {
  return verifyDashboardAuth(event) ? null : unauthorized();
}

module.exports = {
  getDashboardPassword,
  createDashboardCookie,
  clearDashboardCookie,
  verifyDashboardAuth,
  requireDashboardAuth,
};
