/**
 * Workshop Move Student
 *
 * POST: Atomically move a student from one room to another (instructor action)
 */

const { getWorkshopStore } = require('./lib/store');
const { findStudentSlot, firstOpenSlot, normalizeRoom } = require('./lib/rooms');
const { requireDashboardAuth } = require('./lib/dashboard-auth');

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

  const authError = requireDashboardAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, { error: 'Invalid JSON in request body' });
  }

  const { sessionId, studentName, fromRoomId, toRoomId } = body;
  if (!sessionId || !studentName || !fromRoomId || !toRoomId) {
    return json(400, { error: 'Missing required fields: sessionId, studentName, fromRoomId, toRoomId' });
  }

  if (fromRoomId === toRoomId) {
    return json(400, { error: 'Source and target rooms must be different' });
  }

  const store = getWorkshopStore();

  try {
    // Validate session exists
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    if (!session) {
      return json(404, { error: 'Session not found' });
    }

    // Read both rooms
    const sourceRoom = normalizeRoom(await store.get(`room:${sessionId}:${fromRoomId}`, { type: 'json' }), session);
    if (!sourceRoom) {
      return json(404, { error: 'Source room not found' });
    }

    const targetRoom = normalizeRoom(await store.get(`room:${sessionId}:${toRoomId}`, { type: 'json' }), session);
    if (!targetRoom) {
      return json(404, { error: 'Target room not found' });
    }

    // Find student's slot in source room
    const sourceSlot = findStudentSlot(sourceRoom.students, studentName, sourceRoom.roomSize);

    if (!sourceSlot) {
      return json(404, { error: 'Student not found in source room' });
    }

    // Find first available slot in target room
    const targetSlot = firstOpenSlot(targetRoom.students, targetRoom.roomSize);

    if (!targetSlot) {
      return json(409, { error: 'Target room is full' });
    }

    const sourceEmail = sourceRoom.studentEmails?.[sourceSlot] || null;

    // --- Perform the move ---

    // 1. Remove student from source room and set movedTo marker
    sourceRoom.students[sourceSlot] = null;
    sourceRoom[`${sourceSlot}_movedTo`] = {
      roomId: toRoomId,
      studentName,
      timestamp: new Date().toISOString(),
    };

    // Reset source slot's presence
    if (sourceRoom.presence && sourceRoom.presence[sourceSlot]) {
      sourceRoom.presence[sourceSlot] = { online: false, lastSeen: null };
    }

    // Clear source slot's email
    if (sourceRoom.studentEmails[sourceSlot]) {
      sourceRoom.studentEmails[sourceSlot] = null;
    }

    // 2. Add student to target room with movedFrom marker
    targetRoom.students[targetSlot] = studentName;
    targetRoom[`${targetSlot}_movedFrom`] = {
      roomId: fromRoomId,
      studentName,
      timestamp: new Date().toISOString(),
    };

    // Copy email if available
    if (sourceEmail) {
      targetRoom.studentEmails[targetSlot] = sourceEmail;
    }

    // Set presence for the moved student
    targetRoom.presence[targetSlot] = {
      online: true,
      lastSeen: new Date().toISOString(),
    };

    // 3. Reset target room's currentRound to match the moved student's progress
    targetRoom.currentRound = sourceRoom.currentRound;
    targetRoom.roundStartTime = null;

    // 4. Write both rooms
    await store.setJSON(`room:${sessionId}:${fromRoomId}`, sourceRoom);
    await store.setJSON(`room:${sessionId}:${toRoomId}`, targetRoom);

    return json(200, { success: true, newRoom: targetRoom });
  } catch (error) {
    console.error('Move student error:', error);
    return json(500, { error: 'Failed to move student' });
  }
};
