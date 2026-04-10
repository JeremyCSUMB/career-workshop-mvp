/**
 * JWT utility for session tokens
 *
 * Signs and verifies JWTs using SESSION_SECRET env var.
 */

const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing SESSION_SECRET environment variable');
  }
  return secret;
}

function signJwt(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: '8h' });
}

function verifyJwt(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signJwt, verifyJwt };
