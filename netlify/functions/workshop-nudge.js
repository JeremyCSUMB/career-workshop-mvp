/**
 * Workshop Nudge
 *
 * POST: Send a nudge to a room
 * GET:  Get unread nudges for a room (and mark them read)
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

  const store = getStore({ name: 'workshop', consistency: 'strong' });

  // --- GET: fetch unread nudges ---
  if (event.httpMethod === 'GET') {
    const { sessionId, roomId } = event.queryStringParameters || {};
    if (!sessionId || !roomId) {
      return json(400, { error: 'Missing required query parameters: sessionId, roomId' });
    }

    try {
      const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
      if (!room) {
        return json(404, { error: 'Room not found' });
      }

      const unread = room.nudges.filter(n => !n.read);

      // Mark them as read
      for (const nudge of room.nudges) {
        if (!nudge.read) nudge.read = true;
      }

      await store.setJSON(`room:${sessionId}:${roomId}`, room);
      return json(200, { nudges: unread });
    } catch (error) {
      console.error('Get nudges error:', error);
      return json(500, { error: 'Failed to get nudges' });
    }
  }

  // --- POST: send nudge ---
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return json(400, { error: 'Invalid JSON in request body' });
    }

    const { sessionId, roomId, message } = body;
    if (!sessionId || !roomId || !message) {
      return json(400, { error: 'Missing required fields: sessionId, roomId, message' });
    }

    try {
      const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
      if (!room) {
        return json(404, { error: 'Room not found' });
      }

      const nudge = {
        message,
        timestamp: new Date().toISOString(),
        read: false,
      };

      room.nudges.push(nudge);
      await store.setJSON(`room:${sessionId}:${roomId}`, room);

      return json(200, { nudge });
    } catch (error) {
      console.error('Send nudge error:', error);
      return json(500, { error: 'Failed to send nudge' });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
