/**
 * Shared Anthropic API helper
 *
 * Reads ANTHROPIC_API_KEY from .env file first (Netlify Dev sometimes
 * overrides env vars with internal tokens), then falls back to process.env.
 */

const fs = require('fs');
const path = require('path');

let _cachedKey = null;

function getApiKey() {
  if (_cachedKey) return _cachedKey;

  // Try loading from .env file first
  try {
    const envPath = path.resolve(__dirname, '../../../.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match && match[1].startsWith('sk-ant-')) {
      _cachedKey = match[1].trim();
      return _cachedKey;
    }
  } catch {
    // .env not found — fall through
  }

  // Fall back to env var
  const key = process.env.ANTHROPIC_API_KEY;
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
