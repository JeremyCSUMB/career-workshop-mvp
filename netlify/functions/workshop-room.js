/**
 * Workshop Room
 *
 * GET: Return single room detail
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

  const { sessionId, roomId } = event.queryStringParameters || {};
  if (!sessionId || !roomId) {
    return json(400, { error: 'Missing required query parameters: sessionId, roomId' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong' });

  try {
    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    return json(200, { room });
  } catch (error) {
    console.error('Get room error:', error);
    return json(500, { error: 'Failed to get room' });
  }
};
