/**
 * Workshop Session Management
 *
 * POST: Create a new session with N rooms
 * GET:  List all sessions
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

function makeEmptyRoom(sessionId, roomId) {
  return {
    id: roomId,
    sessionId,
    students: {},
    currentRound: 1,
    roundStartTime: null,
    lastHeartbeat: null,
    lastInputTime: null,
    submissions: [],
    aiFollowUps: [],
    capabilityProfile: null,
    classifications: [],
    nudges: [],
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const store = getStore({ name: 'workshop', consistency: 'strong' });

  // --- GET: list sessions ---
  if (event.httpMethod === 'GET') {
    try {
      const { blobs } = await store.list({ prefix: 'session:' });
      const sessions = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: 'json' });
        if (data) sessions.push(data);
      }
      return json(200, { sessions });
    } catch (error) {
      console.error('List sessions error:', error);
      return json(500, { error: 'Failed to list sessions' });
    }
  }

  // --- POST: create session ---
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return json(400, { error: 'Invalid JSON in request body' });
    }

    const { name, roomCount } = body;
    if (!name || !roomCount || roomCount < 1) {
      return json(400, { error: 'Missing required fields: name, roomCount (>= 1)' });
    }

    const sessionId = Math.random().toString(36).substring(2, 8);
    const session = {
      id: sessionId,
      name,
      created: new Date().toISOString(),
      roomCount,
    };

    try {
      await store.setJSON(`session:${sessionId}`, session);

      // Create empty room blobs
      for (let i = 1; i <= roomCount; i++) {
        const roomId = String(i);
        await store.setJSON(`room:${sessionId}:${roomId}`, makeEmptyRoom(sessionId, roomId));
      }

      return json(201, { session });
    } catch (error) {
      console.error('Create session error:', error);
      return json(500, { error: 'Failed to create session' });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
