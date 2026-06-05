/**
 * Workshop Leave
 *
 * POST: Remove a student from a room so they can pick a different one
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

  const { sessionId, roomId, studentName } = body;
  if (!sessionId || !roomId || !studentName) {
    return json(400, { error: 'Missing required fields: sessionId, roomId, studentName' });
  }

  const store = getWorkshopStore();

  try {
    const session = await store.get(`session:${sessionId}`, { type: 'json' }).catch(() => null);
    const room = normalizeRoom(await store.get(`room:${sessionId}:${roomId}`, { type: 'json' }), session || {});
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    // Remove student from their slot
    const slot = findStudentSlot(room.students, studentName, room.roomSize);
    if (!slot) {
      return json(404, { error: 'Student not found in this room' });
    }
    room.students[slot] = null;
    if (room.presence?.[slot]) room.presence[slot] = { online: false, lastSeen: null };
    if (room.studentEmails?.[slot]) room.studentEmails[slot] = null;

    await store.setJSON(`room:${sessionId}:${roomId}`, room);
    return json(200, { ok: true });
  } catch (error) {
    console.error('Leave room error:', error);
    return json(500, { error: 'Failed to leave room' });
  }
};
