/**
 * Workshop Room
 *
 * GET: Return single room detail
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

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const { sessionId, roomId } = event.queryStringParameters || {};
  if (!sessionId || !roomId) {
    return json(400, { error: 'Missing required query parameters: sessionId, roomId' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    // Check if session has ended
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    const ended = !!session?.ended;

    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    // Normalize fields for older rooms missing newer keys
    if (!Array.isArray(room.submissions)) room.submissions = [];
    if (!Array.isArray(room.aiFollowUps)) room.aiFollowUps = [];
    if (!Array.isArray(room.capabilityProfiles)) {
      room.capabilityProfiles = room.capabilityProfile ? [room.capabilityProfile] : [];
    }

    // Normalize presence for old rooms
    const defaultPresence = { online: false, lastSeen: null };
    if (!room.presence) {
      room.presence = { student1: { ...defaultPresence }, student2: { ...defaultPresence } };
    } else {
      if (!room.presence.student1) room.presence.student1 = { ...defaultPresence };
      if (!room.presence.student2) room.presence.student2 = { ...defaultPresence };
    }

    // Look up user profiles for authenticated students
    if (room.studentEmails) {
      room.authenticatedStudents = {};
      for (const [slot, email] of Object.entries(room.studentEmails)) {
        if (email) {
          try {
            const profile = await store.get(`user:${email}`, { type: 'json' });
            if (profile) room.authenticatedStudents[slot] = profile;
          } catch { /* skip */ }
        }
      }
    }

    return json(200, { room, ended });
  } catch (error) {
    console.error('Get room error:', error);
    return json(500, { error: 'Failed to get room' });
  }
};
