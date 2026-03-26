/**
 * Workshop Heartbeat
 *
 * POST: Update room heartbeat timestamp
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

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, { error: 'Invalid JSON in request body' });
  }

  const { sessionId, roomId } = body;
  if (!sessionId || !roomId) {
    return json(400, { error: 'Missing required fields: sessionId, roomId' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    // Check if session has ended
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    if (!session) {
      return json(404, { error: 'Session not found' });
    }
    if (session.ended) {
      return json(403, { error: 'This session has ended' });
    }

    // Write heartbeat to a separate blob key so we never do a
    // read-modify-write on the room blob (avoids race with join/leave).
    const timestamp = new Date().toISOString();
    await store.setJSON(`heartbeat:${sessionId}:${roomId}`, { timestamp, roomId });

    return json(200, { ok: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return json(500, { error: 'Failed to update heartbeat' });
  }
};
