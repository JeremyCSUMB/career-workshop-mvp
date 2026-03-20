/**
 * Workshop Profile
 *
 * POST: Generate a capability profile from interview notes
 */

const { getStore } = require('@netlify/blobs');

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

async function callClaude(system, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
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

  const store = getStore({ name: 'workshop', consistency: 'strong' });

  try {
    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    // Gather submissions about this student (they were the storyteller,
    // so the interviewer submitted notes about them in the given round)
    const relevantSubmissions = room.submissions.filter(
      s => s.round === round && s.studentName !== studentName
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

    // Store profile in room state
    room.capabilityProfile = profile;

    // Advance round: if round 1 just ended, set up for round 2
    if (round === 1) {
      room.currentRound = 2;
      room.roundStartTime = new Date().toISOString();
    } else if (round === 2) {
      room.currentRound = 3; // signals complete
    }

    await store.setJSON(`room:${sessionId}:${roomId}`, room);

    return json(200, { profile });
  } catch (error) {
    console.error('Profile error:', error);
    return json(500, { error: 'Failed to generate capability profile' });
  }
};
