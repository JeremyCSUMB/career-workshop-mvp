/**
 * Workshop Heartbeat
 *
 * POST: Update room heartbeat timestamp
 */

const { getWorkshopStore } = require('./lib/store');
const { findStudentSlot, normalizeRoom } = require('./lib/rooms');

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

  const { sessionId, roomId, studentName, readyForRound } = body;
  if (!sessionId || !roomId) {
    return json(400, { error: 'Missing required fields: sessionId, roomId' });
  }

  const store = getWorkshopStore();

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

    // Update per-student presence in the room blob
    if (studentName) {
      const room = normalizeRoom(await store.get(`room:${sessionId}:${roomId}`, { type: 'json' }), session);
      if (room) {
        const slot = findStudentSlot(room.students, studentName, room.roomSize);

        if (slot) {
          room.presence[slot].online = true;
          room.presence[slot].lastSeen = timestamp;
          if (typeof readyForRound === 'number') {
            room.presence[slot].readyForRound = readyForRound;
          }
          await store.setJSON(`room:${sessionId}:${roomId}`, room);
        }
      }
    }

    return json(200, { ok: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return json(500, { error: 'Failed to update heartbeat' });
  }
};
