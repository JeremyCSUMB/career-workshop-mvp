/**
 * Workshop Classify Inactive
 *
 * GET: Check all rooms in a session for inactivity (no heartbeat > 90s)
 */

const { getWorkshopStore } = require('./lib/store');
const { getStudentNames, normalizeRoom } = require('./lib/rooms');
const { requireDashboardAuth } = require('./lib/dashboard-auth');

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

  const authError = requireDashboardAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const sessionId = event.queryStringParameters?.sessionId;
  if (!sessionId) {
    return json(400, { error: 'Missing required query parameter: sessionId' });
  }

  const store = getWorkshopStore();

  try {
    const { blobs } = await store.list({ prefix: `room:${sessionId}:` });
    const session = await store.get(`session:${sessionId}`, { type: 'json' }).catch(() => null);
    const now = new Date();
    const flagged = [];

    for (const blob of blobs) {
      const roomId = blob.key.split(':').pop();
      const [roomData, heartbeat] = await Promise.all([
        store.get(blob.key, { type: 'json' }),
        store.get(`heartbeat:${sessionId}:${roomId}`, { type: 'json' }).catch(() => null),
      ]);
      const room = normalizeRoom(roomData, session || {});
      if (!room) continue;

      const lastHeartbeat = heartbeat?.timestamp || room.lastHeartbeat || null;

      // Skip rooms with no heartbeat (never started) or no students
      if (!lastHeartbeat || getStudentNames(room.students, room.roomSize).length === 0) continue;

      const heartbeatAge = now - new Date(lastHeartbeat);
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
