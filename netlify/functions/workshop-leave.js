/**
 * Workshop Leave
 *
 * POST: Remove a student from a room so they can pick a different one
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
    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    // Remove student from their slot
    if (room.students.student1 === studentName) {
      room.students.student1 = null;
    } else if (room.students.student2 === studentName) {
      room.students.student2 = null;
    } else {
      return json(404, { error: 'Student not found in this room' });
    }

    await store.setJSON(`room:${sessionId}:${roomId}`, room);
    return json(200, { ok: true });
  } catch (error) {
    console.error('Leave room error:', error);
    return json(500, { error: 'Failed to leave room' });
  }
};
