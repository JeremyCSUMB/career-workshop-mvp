/**
 * Workshop Join
 *
 * POST: Student joins a room (as student1 or student2)
 */

const { getWorkshopStore } = require('./lib/store');
const { verifyJwt } = require('./lib/jwt');
const { parseCookies } = require('./lib/cookies');
const { findStudentSlot, firstOpenSlot, getRoomSlots, normalizeRoom, normalizeRoomSize } = require('./lib/rooms');

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

  const { sessionId, roomId, studentName, claimSlot } = body;
  if (!sessionId || !roomId || !studentName) {
    return json(400, { error: 'Missing required fields: sessionId, roomId, studentName' });
  }
  // Extract email from session cookie if authenticated
  let userEmail = null;
  try {
    const cookies = parseCookies(event.headers.cookie);
    if (cookies.session) {
      const payload = verifyJwt(cookies.session);
      userEmail = payload.email || null;
    }
  } catch {
    // Not authenticated or invalid token — proceed without email
  }

  const store = getWorkshopStore();

  try {
    // Check if session exists
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    if (!session) {
      return json(404, { error: 'Session not found' });
    }
    const roomSize = normalizeRoomSize(session.roomSize);
    const slots = getRoomSlots(roomSize);
    if (claimSlot && !slots.includes(claimSlot)) {
      return json(400, { error: `claimSlot must be one of: ${slots.join(', ')}` });
    }

    // Try to join with a verify-after-write to guard against concurrent
    // writes (e.g. another join or nudge POST) clobbering our update.
    async function tryJoin() {
      const room = normalizeRoom(await store.get(`room:${sessionId}:${roomId}`, { type: 'json' }), session);
      if (!room) {
        return json(404, { error: 'Room not found' });
      }

      // Allow rejoin if student is already in the room
      const existingSlot = findStudentSlot(room.students, studentName, room.roomSize);

      if (existingSlot) {
        // Update email on rejoin if authenticated
        if (userEmail) {
          room.studentEmails[existingSlot] = userEmail;
          await store.setJSON(`room:${sessionId}:${roomId}`, room);
        }
        return json(200, { room, rejoined: true });
      }

      // Block new joins for ended sessions (checked after rejoin so
      // students can resume an ended session they were already in)
      if (session.ended) {
        return json(403, { error: 'This session has ended' });
      }

      let assignedSlot = null;
      const openSlot = firstOpenSlot(room.students, room.roomSize);
      if (openSlot) {
        assignedSlot = openSlot;
        room.students[assignedSlot] = studentName;
      } else if (claimSlot) {
        // Claim an existing slot (student lost their name / different device)
        room.students[claimSlot] = studentName;
        assignedSlot = claimSlot;
      } else {
        return json(409, { error: 'Room is full', students: room.students });
      }

      // Store email for the assigned slot if authenticated
      if (userEmail && assignedSlot) {
        room.studentEmails[assignedSlot] = userEmail;
      }

      await store.setJSON(`room:${sessionId}:${roomId}`, room);

      // Verify our write was not clobbered by a concurrent operation
      const verified = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
      const present = !!findStudentSlot(verified?.students, studentName, room.roomSize);

      if (!present) {
        return null; // signal retry
      }

      return json(200, { room: verified, ...(claimSlot ? { rejoined: true, claimed: true } : {}) });
    }

    // Attempt join, retry once if clobbered by a concurrent write
    let result = await tryJoin();
    if (result === null) {
      result = await tryJoin();
    }
    if (result === null) {
      // Re-fetch to include current students in the conflict response
      const conflictRoom = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
      return json(409, { error: 'Join conflict, please try again', students: conflictRoom?.students });
    }
    return result;
  } catch (error) {
    console.error('Join room error:', error);
    return json(500, { error: 'Failed to join room' });
  }
};
