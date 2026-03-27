/**
 * Workshop Rooms
 *
 * GET: Return all rooms for a session
 */

const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const sessionId = event.queryStringParameters?.sessionId;
  if (!sessionId) {
    return json(400, { error: 'Missing required query parameter: sessionId' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    // Fetch session to get custom prompts and round count
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    const rounds = (session?.rounds || 1) * 2;
    const prompts = session?.prompts || null;

    const { blobs } = await store.list({ prefix: `room:${sessionId}:` });
    const rooms = (await Promise.all(
      blobs.map((blob) => store.get(blob.key, { type: 'json' }))
    )).filter(Boolean);

    return json(200, { rooms, rounds, prompts, ended: !!session?.ended });
  } catch (error) {
    console.error('List rooms error:', error);
    return json(500, { error: 'Failed to list rooms' });
  }
};
