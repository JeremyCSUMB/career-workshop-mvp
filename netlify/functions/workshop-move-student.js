/**
 * Workshop Move Student
 *
 * POST: Atomically move a student from one room to another (instructor action)
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

  const { sessionId, studentName, fromRoomId, toRoomId } = body;
  if (!sessionId || !studentName || !fromRoomId || !toRoomId) {
    return json(400, { error: 'Missing required fields: sessionId, studentName, fromRoomId, toRoomId' });
  }

  if (fromRoomId === toRoomId) {
    return json(400, { error: 'Source and target rooms must be different' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    // Validate session exists
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    if (!session) {
      return json(404, { error: 'Session not found' });
    }

    // Read both rooms
    const sourceRoom = await store.get(`room:${sessionId}:${fromRoomId}`, { type: 'json' });
    if (!sourceRoom) {
      return json(404, { error: 'Source room not found' });
    }

    const targetRoom = await store.get(`room:${sessionId}:${toRoomId}`, { type: 'json' });
    if (!targetRoom) {
      return json(404, { error: 'Target room not found' });
    }

    // Find student's slot in source room
    let sourceSlot = null;
    if (sourceRoom.students.student1 === studentName) {
      sourceSlot = 'student1';
    } else if (sourceRoom.students.student2 === studentName) {
      sourceSlot = 'student2';
    }

    if (!sourceSlot) {
      return json(404, { error: 'Student not found in source room' });
    }

    // Ensure target room has presence and studentEmails (old rooms may lack them)
    if (!targetRoom.presence) {
      targetRoom.presence = {
        student1: { online: false, lastSeen: null },
        student2: { online: false, lastSeen: null },
      };
    }
    if (!targetRoom.studentEmails) {
      targetRoom.studentEmails = {};
    }
    if (!sourceRoom.studentEmails) {
      sourceRoom.studentEmails = {};
    }

    // Find first available slot in target room
    let targetSlot = null;
    if (!targetRoom.students.student1) {
      targetSlot = 'student1';
    } else if (!targetRoom.students.student2) {
      targetSlot = 'student2';
    }

    if (!targetSlot) {
      return json(409, { error: 'Target room is full' });
    }

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
    if (sourceRoom.studentEmails && sourceRoom.studentEmails[sourceSlot]) {
      targetRoom.studentEmails[targetSlot] = sourceRoom.studentEmails[sourceSlot];
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
