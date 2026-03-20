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

  const store = getStore({ name: 'workshop', consistency: 'strong' });

  try {
    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
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
    return json(200, { room });
  } catch (error) {
    console.error('Join room error:', error);
    return json(500, { error: 'Failed to join room' });
  }
};
