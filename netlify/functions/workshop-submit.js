/**
 * Workshop Submit
 *
 * POST: Interviewer submits notes for a round
 */

const { getWorkshopStore } = require('./lib/store');
const { normalizeRoom, rolesForRound } = require('./lib/rooms');

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

  const { sessionId, roomId, studentName, aboutStudent, notes, round, role } = body;
  if (!sessionId || !roomId || !studentName || !notes || !round) {
    return json(400, { error: 'Missing required fields: sessionId, roomId, studentName, notes, round' });
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

    const room = normalizeRoom(await store.get(`room:${sessionId}:${roomId}`, { type: 'json' }), session);
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    const now = new Date().toISOString();
    const wordCount = notes.trim().split(/\s+/).filter(Boolean).length;

    const roundNum = Number(String(round).match(/^round(\d+)/)?.[1] || room.currentRound || 1);
    const roundRoles = rolesForRound(room.students, roundNum, room.roomSize);
    const submission = {
      studentName,
      aboutStudent: aboutStudent || null,
      role: role || (room.roomSize === 3 ? 'note-taker' : 'interviewer'),
      asker: roundRoles?.asker || null,
      notes,
      wordCount,
      timestamp: now,
      round,
    };

    // Upsert: replace existing submission with same studentName + round
    // to avoid duplicates from auto-save and explicit submit
    const existingIdx = room.submissions.findIndex(
      s => s.studentName === studentName && s.round === round
    );
    if (existingIdx !== -1) {
      room.submissions[existingIdx] = submission;
    } else {
      room.submissions.push(submission);
    }
    room.lastInputTime = now;
    room.lastHeartbeat = now;

    // Set round start time on first submission if not set
    if (!room.roundStartTime) {
      room.roundStartTime = now;
    }

    await store.setJSON(`room:${sessionId}:${roomId}`, room);
    return json(200, { room });
  } catch (error) {
    console.error('Submit error:', error);
    return json(500, { error: 'Failed to submit notes' });
  }
};
