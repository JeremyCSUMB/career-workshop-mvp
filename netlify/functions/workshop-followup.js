/**
 * Workshop Follow-Up
 *
 * POST: Generate AI follow-up questions based on interviewer notes
 */

const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const FOLLOWUP_SYSTEM_PROMPT = 'You are helping an interviewer deepen a peer conversation about a time someone had to figure something out without a clear answer. Given the interviewer\'s notes, generate 2-3 follow-up questions that help surface specific capabilities, decisions, and outcomes. Questions should push beyond surface-level. Return JSON: { "questions": ["q1", "q2", "q3"] }';

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

  const { sessionId, roomId, notes } = body;
  if (!sessionId || !roomId || !notes) {
    return json(400, { error: 'Missing required fields: sessionId, roomId, notes' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong' });

  try {
    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    const aiText = await callClaude(FOLLOWUP_SYSTEM_PROMPT, `Interviewer's notes:\n\n${notes}`);

    // Parse AI response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json(502, { error: 'AI did not return valid JSON' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const questions = parsed.questions || [];

    // Store in room state
    room.aiFollowUps.push({
      questions,
      timestamp: new Date().toISOString(),
    });

    await store.setJSON(`room:${sessionId}:${roomId}`, room);
    return json(200, { questions });
  } catch (error) {
    console.error('Follow-up error:', error);
    return json(500, { error: 'Failed to generate follow-up questions' });
  }
};
