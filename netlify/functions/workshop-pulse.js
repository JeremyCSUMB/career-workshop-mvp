/**
 * Workshop Pulse
 *
 * GET: Return lightweight summary of all rooms in a session.
 * Designed for aggressive polling (every 2s) — returns only
 * timestamps and counts, not full submission data.
 */

const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const sessionId = event.queryStringParameters?.sessionId;
  if (!sessionId) {
    return json(400, { error: 'Missing required query parameter: sessionId' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    const { blobs } = await store.list({ prefix: `room:${sessionId}:` });

    // Fetch room blobs and their separate heartbeat blobs in parallel
    const allData = await Promise.all(
      blobs.map(async (blob) => {
        const roomId = blob.key.split(':').pop();
        const [room, hb] = await Promise.all([
          store.get(blob.key, { type: 'json' }),
          store.get(`heartbeat:${sessionId}:${roomId}`, { type: 'json' }).catch(() => null),
        ]);
        return { room, heartbeat: hb };
      })
    );
    const rooms = [];
    const now = Date.now();
    const PRESENCE_TIMEOUT = 30000;

    for (const { room: data, heartbeat: hbData } of allData) {
      if (!data) continue;

      const students = data.students || {};
      const studentNames = Object.values(students).filter(Boolean);
      const submissions = data.submissions || [];
      const totalWords = submissions.reduce((sum, s) => sum + (s.wordCount || 0), 0);
      const latestSubmissionTime = submissions.length > 0
        ? submissions[submissions.length - 1].timestamp
        : null;

      // Compute presence with online boolean based on 30s threshold
      const rawPresence = data.presence || {};
      const computeOnline = (slot) => {
        const p = rawPresence[slot];
        if (!p || !p.lastSeen) return { online: false, lastSeen: null };
        const elapsed = now - new Date(p.lastSeen).getTime();
        return { online: elapsed <= PRESENCE_TIMEOUT, lastSeen: p.lastSeen };
      };
      const presence = {
        student1: computeOnline('student1'),
        student2: computeOnline('student2'),
      };

      rooms.push({
        id: data.id,
        studentCount: studentNames.length,
        studentNames,
        students: students,
        submissionCount: submissions.length,
        wordCount: totalWords,
        lastInputTime: data.lastInputTime || null,
        lastHeartbeat: hbData?.timestamp || data.lastHeartbeat || null,
        latestSubmissionTime,
        currentRound: data.currentRound || 1,
        roundStartTime: data.roundStartTime || null,
        hasClassification: (data.classifications || []).length > 0,
        latestStatus: (data.classifications || []).length > 0
          ? (data.classifications[data.classifications.length - 1].status || '').toLowerCase()
          : '',
        presence,
      });
    }

    return json(200, { rooms, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error('Pulse error:', error);
    return json(500, { error: 'Failed to fetch pulse' });
  }
};
