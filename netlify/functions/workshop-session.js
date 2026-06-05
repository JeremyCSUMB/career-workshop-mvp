/**
 * Workshop Session Management
 *
 * POST: Create a new session with N rooms
 * GET:  List all sessions
 */

const { getWorkshopStore } = require('./lib/store');
const { requireDashboardAuth } = require('./lib/dashboard-auth');
const { getRoomSlots, normalizeRoomSize, totalRoundsForQuestions } = require('./lib/rooms');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

function makeEmptyRoom(sessionId, roomId, roomSize = 2) {
  const size = normalizeRoomSize(roomSize);
  const slots = getRoomSlots(size);
  return {
    id: roomId,
    sessionId,
    roomSize: size,
    students: Object.fromEntries(slots.map((slot) => [slot, null])),
    currentRound: 1,
    roundStartTime: null,
    lastHeartbeat: null,
    lastInputTime: null,
    submissions: [],
    aiFollowUps: [],
    capabilityProfile: null,
    capabilityProfiles: [],
    classifications: [],
    nudges: [],
    studentEmails: Object.fromEntries(slots.map((slot) => [slot, null])),
    presence: Object.fromEntries(slots.map((slot) => [slot, { online: false, lastSeen: null }])),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authError = requireDashboardAuth(event);
  if (authError) return authError;

  const store = getWorkshopStore();

  // --- GET: list sessions ---
  if (event.httpMethod === 'GET') {
    try {
      const { blobs } = await store.list({ prefix: 'session:' });
      const sessions = (await Promise.all(
        blobs.map((blob) => store.get(blob.key, { type: 'json' }))
      )).filter(Boolean).map((session) => ({
        ...session,
        roomSize: normalizeRoomSize(session.roomSize),
      }));
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

    const { name, roomCount, rounds, questions, prompts, roomSize } = body;
    if (!name || !roomCount || roomCount < 1) {
      return json(400, { error: 'Missing required fields: name, roomCount (>= 1)' });
    }

    const defaultPrompt = 'Tell your partner about a time you had to figure something out where there wasn\'t a clear answer. Any context \u2014 work, school, personal. Don\'t pick the most impressive story. Pick what comes to mind first. 3-4 minutes.';
    const size = normalizeRoomSize(roomSize);
    // questions = number of prompts; rounds = questions * roomSize (each question has one turn per student)
    const questionCount = Math.max(1, Math.min(10, questions || Math.ceil((rounds || 1) / size)));
    const roundCount = totalRoundsForQuestions(questionCount, size);

    // Build prompts array — one per question, falling back to default
    const sessionPrompts = [];
    for (let i = 0; i < questionCount; i++) {
      sessionPrompts.push((prompts && prompts[i]) ? prompts[i] : defaultPrompt);
    }

    const sessionId = Math.random().toString(36).substring(2, 8);
    const session = {
      id: sessionId,
      name,
      created: new Date().toISOString(),
      roomCount,
      roomSize: size,
      rounds: roundCount,
      questions: questionCount,
      prompts: sessionPrompts,
    };

    try {
      await store.setJSON(`session:${sessionId}`, session);

      // Create empty room blobs
      for (let i = 1; i <= roomCount; i++) {
        const roomId = String(i);
        await store.setJSON(`room:${sessionId}:${roomId}`, makeEmptyRoom(sessionId, roomId, size));
      }

      return json(201, { session });
    } catch (error) {
      console.error('Create session error:', error);
      return json(500, { error: 'Failed to create session' });
    }
  }

  // --- DELETE: end session (marks as ended, keeps data) ---
  if (event.httpMethod === 'DELETE') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return json(400, { error: 'Invalid JSON in request body' });
    }

    const { sessionId } = body;
    if (!sessionId) {
      return json(400, { error: 'Missing required field: sessionId' });
    }

    try {
      const session = await store.get(`session:${sessionId}`, { type: 'json' });
      if (!session) {
        return json(404, { error: 'Session not found' });
      }

      session.ended = true;
      session.endedAt = new Date().toISOString();
      await store.setJSON(`session:${sessionId}`, session);

      return json(200, { ended: true });
    } catch (error) {
      console.error('End session error:', error);
      return json(500, { error: 'Failed to end session' });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
