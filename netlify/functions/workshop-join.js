/**
 * Workshop Join
 *
 * POST: Student joins a room (as student1 or student2)
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

  const { sessionId, roomId, studentName } = body;
  if (!sessionId || !roomId || !studentName) {
    return json(400, { error: 'Missing required fields: sessionId, roomId, studentName' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    // Check if session exists
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    if (!session) {
      return json(404, { error: 'Session not found' });
    }

    // Try to join with a verify-after-write to guard against concurrent
    // writes (e.g. another join or nudge POST) clobbering our update.
    async function tryJoin() {
      const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
      if (!room) {
        return json(404, { error: 'Room not found' });
      }

      // Allow rejoin if student is already in the room
      const alreadyIn =
        room.students.student1 === studentName ||
        room.students.student2 === studentName;

      if (alreadyIn) {
        return json(200, { room, rejoined: true });
      }

      // Block new joins for ended sessions (checked after rejoin so
      // students can resume an ended session they were already in)
      if (session.ended) {
        return json(403, { error: 'This session has ended' });
      }

      // Assign to first available slot
      if (!room.students.student1) {
        room.students.student1 = studentName;
      } else if (!room.students.student2) {
        room.students.student2 = studentName;
      } else {
        return json(409, { error: 'Room is full' });
      }

      await store.setJSON(`room:${sessionId}:${roomId}`, room);

      // Verify our write was not clobbered by a concurrent operation
      const verified = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
      const present =
        verified.students.student1 === studentName ||
        verified.students.student2 === studentName;

      if (!present) {
        return null; // signal retry
      }

      return json(200, { room: verified });
    }

    // Attempt join, retry once if clobbered by a concurrent write
    let result = await tryJoin();
    if (result === null) {
      result = await tryJoin();
    }
    if (result === null) {
      return json(409, { error: 'Join conflict, please try again' });
    }
    return result;
  } catch (error) {
    console.error('Join room error:', error);
    return json(500, { error: 'Failed to join room' });
  }
};
