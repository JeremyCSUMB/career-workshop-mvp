/**
 * Shared Anthropic API helper
 *
 * Reads ANTHROPIC_API_KEY from .env file first, then falls back to process.env.
 * Netlify's local function bundler can change __dirname, so resolve .env from
 * the current project root before trying helper-relative paths.
 */

const fs = require('fs');
const path = require('path');

let _cachedKey = null;

function normalizeEnvValue(value) {
  return value?.trim().replace(/^['"]|['"]$/g, '');
}

function readDotenvKey() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  for (const envPath of candidates) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
      const key = normalizeEnvValue(match?.[1]);
      if (key?.startsWith('sk-ant-')) return key;
    } catch {
      // Try the next likely location.
    }
  }

  return null;
}

function getApiKey() {
  if (_cachedKey) return _cachedKey;

  const dotenvKey = readDotenvKey();
  if (dotenvKey) {
    _cachedKey = dotenvKey;
    return _cachedKey;
  }

  const key = normalizeEnvValue(process.env.ANTHROPIC_API_KEY);
  if (key && key.startsWith('sk-ant-')) {
    _cachedKey = key;
    return _cachedKey;
  }

  throw new Error('Missing valid ANTHROPIC_API_KEY');
}

async function callClaude(system, userMessage, { maxTokens = 1024 } = {}) {
  const apiKey = getApiKey();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

module.exports = { callClaude, getApiKey };
