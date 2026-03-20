/**
 * Workshop Classify Inactive
 *
 * GET: Check all rooms in a session for inactivity (no heartbeat > 90s)
 */

const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const INACTIVITY_THRESHOLD_MS = 90 * 1000; // 90 seconds

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

  const store = getStore({ name: 'workshop', consistency: 'strong' });

  try {
    const { blobs } = await store.list({ prefix: `room:${sessionId}:` });
    const now = new Date();
    const flagged = [];

    for (const blob of blobs) {
      const room = await store.get(blob.key, { type: 'json' });
      if (!room) continue;

      // Skip rooms with no heartbeat (never started) or no students
      if (!room.lastHeartbeat || Object.keys(room.students).length === 0) continue;

      const heartbeatAge = now - new Date(room.lastHeartbeat);
      if (heartbeatAge <= INACTIVITY_THRESHOLD_MS) continue;

      // Check if already classified as red from inactivity
      const lastClassification = room.classifications[room.classifications.length - 1];
      if (
        lastClassification &&
        lastClassification.status === 'red' &&
        lastClassification.method === 'inactivity'
      ) {
        continue; // Already flagged, skip
      }

      const classification = {
        status: 'red',
        reasoning: 'No heartbeat detected — room may be inactive',
        method: 'inactivity',
        timestamp: now.toISOString(),
        suggestedNudge: null,
      };

      room.classifications.push(classification);
      await store.setJSON(blob.key, room);

      flagged.push({ roomId: room.id, sessionId: room.sessionId, classification });
    }

    return json(200, { flagged });
  } catch (error) {
    console.error('Classify inactive error:', error);
    return json(500, { error: 'Failed to check inactive rooms' });
  }
};
