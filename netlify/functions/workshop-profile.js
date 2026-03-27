/**
 * Workshop Profile
 *
 * POST: Generate a capability profile from interview notes
 */

const { getStore } = require('@netlify/blobs');
const { callClaude } = require('./lib/anthropic');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const PROFILE_SYSTEM_PROMPT = 'Given interview notes about a student\'s experience figuring something out without a clear answer, generate a capability profile that translates their story into employer-relevant strengths. Be specific — not \'good communicator\' but \'de-escalated customer conflict independently.\' Return JSON: { "capabilities": [{ "capability": "...", "evidence": "..." }], "summary": "1-2 sentence overview" }';

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

  const { sessionId, roomId, studentName, round } = body;
  if (!sessionId || !roomId || !studentName || !round) {
    return json(400, { error: 'Missing required fields: sessionId, roomId, studentName, round' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    // Check if session has ended
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    if (!session) {
      return json(404, { error: 'Session not found' });
    }
    if (session.ended) {
      return json(403, { error: 'This session has ended' });
    }

    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    // Gather submissions about this student (they were the storyteller,
    // so the interviewer submitted notes about them in the given round)
    // round comes in as a number (1 or 2) but submissions store
    // round as strings like "round1-notes" or "round1-followup"
    const roundPrefix = `round${round}`;
    const relevantSubmissions = room.submissions.filter(
      s => s.round.startsWith(roundPrefix) && (
        s.aboutStudent ? s.aboutStudent === studentName : s.studentName !== studentName
      )
    );

    if (relevantSubmissions.length === 0) {
      return json(400, { error: 'No interview notes found for this student in the given round' });
    }

    const allNotes = relevantSubmissions
      .map(s => `[Interviewer: ${s.studentName}]: ${s.notes}`)
      .join('\n\n');

    const aiText = await callClaude(
      PROFILE_SYSTEM_PROMPT,
      `Student: ${studentName}\n\nInterview notes about this student:\n\n${allNotes}`
    );

    // Parse AI response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json(502, { error: 'AI did not return valid JSON' });
    }

    const profile = JSON.parse(jsonMatch[0]);
    profile.studentName = studentName;
    profile.round = round;
    profile.generatedAt = new Date().toISOString();

    // Store profile in room state (accumulate across rounds)
    if (!Array.isArray(room.capabilityProfiles)) {
      // Migrate from old single-profile format
      room.capabilityProfiles = room.capabilityProfile ? [room.capabilityProfile] : [];
    }
    room.capabilityProfiles.push(profile);
    room.capabilityProfile = profile; // keep for backward compat

    // Advance round: reuse session fetched above to know total rounds
    const totalRounds = session?.rounds || 2;

    if (round < totalRounds) {
      room.currentRound = round + 1;
      room.roundStartTime = new Date().toISOString();
    } else {
      room.currentRound = totalRounds + 1; // signals complete
    }

    await store.setJSON(`room:${sessionId}:${roomId}`, room);

    return json(200, { profile });
  } catch (error) {
    console.error('Profile error:', error);
    return json(500, { error: 'Failed to generate capability profile' });
  }
};
