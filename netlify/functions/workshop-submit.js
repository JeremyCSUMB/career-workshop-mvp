/**
 * Workshop Submit
 *
 * POST: Interviewer submits notes for a round
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

  const { sessionId, roomId, studentName, notes, round } = body;
  if (!sessionId || !roomId || !studentName || !notes || !round) {
    return json(400, { error: 'Missing required fields: sessionId, roomId, studentName, notes, round' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    const now = new Date().toISOString();
    const wordCount = notes.trim().split(/\s+/).filter(Boolean).length;

    const submission = {
      studentName,
      role: 'interviewer',
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
