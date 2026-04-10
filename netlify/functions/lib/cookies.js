/**
 * Cookie parsing utility for Netlify Functions.
 *
 * Parses the Cookie header string into a name→value object.
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

module.exports = { parseCookies };
