/**
 * Workshop Classify
 *
 * POST: Classify a room's engagement status (red/yellow/green)
 *       Uses heuristics first, falls back to AI classification.
 */

const { getStore } = require('@netlify/blobs');
const { callClaude } = require('./lib/anthropic');

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

  const { sessionId, roomId } = body;
  if (!sessionId || !roomId) {
    return json(400, { error: 'Missing required fields: sessionId, roomId' });
  }

  const store = getStore({ name: 'workshop', consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.NETLIFY_PAT });

  try {
    const room = await store.get(`room:${sessionId}:${roomId}`, { type: 'json' });
    if (!room) {
      return json(404, { error: 'Room not found' });
    }

    const now = new Date();
    let classification = null;

    // Calculate total word count across submissions
    const totalWordCount = room.submissions.reduce((sum, s) => sum + (s.wordCount || 0), 0);

    // Check time since last input
    const lastInputAge = room.lastInputTime
      ? (now - new Date(room.lastInputTime)) / 1000 / 60 // minutes
      : Infinity;

    // --- Heuristic checks ---
    if (totalWordCount < 15 || lastInputAge > 3) {
      classification = {
        status: 'red',
        reasoning: totalWordCount < 15
          ? `Very low word count (${totalWordCount} words)`
          : `No input for ${Math.round(lastInputAge)} minutes`,
        method: 'heuristic',
        timestamp: now.toISOString(),
        suggestedNudge: null,
      };
    } else if (totalWordCount < 50 || room.submissions.length <= 1) {
      classification = {
        status: 'yellow',
        reasoning: totalWordCount < 50
          ? `Low word count (${totalWordCount} words)`
          : `Only ${room.submissions.length} submission(s) so far`,
        method: 'heuristic',
        timestamp: now.toISOString(),
        suggestedNudge: null,
      };
    } else {
      // --- AI classification ---
      try {
        const allNotes = room.submissions.map(s => {
          const about = s.aboutStudent ? ` (notes about ${s.aboutStudent}'s story)` : '';
          return `[${s.studentName}${about}]: ${s.notes}`;
        }).join('\n\n');

        const systemPrompt = 'You are classifying student engagement in a peer interview workshop where students take turns interviewing each other. Each student tells their OWN story when they are the storyteller, and takes notes about their PARTNER\'s story when they are the interviewer. The notes from different students describe DIFFERENT stories from different people — do not treat them as one narrative. Given the interview notes, classify the room status. Return ONLY valid JSON: { "status": "red|yellow|green", "reasoning": "brief explanation", "suggested_nudge": "optional nudge message or null" }';

        const aiText = await callClaude(systemPrompt, `Interview notes from this room:\n\n${allNotes}`);

        // Parse AI response — extract JSON from potential markdown wrapping
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          classification = {
            status: parsed.status,
            reasoning: parsed.reasoning,
            method: 'ai',
            timestamp: now.toISOString(),
            suggestedNudge: parsed.suggested_nudge || null,
          };
        } else {
          throw new Error('AI did not return valid JSON');
        }
      } catch (aiError) {
        console.error('AI classification failed, falling back:', aiError);
        classification = {
          status: 'green',
          reasoning: 'AI classification unavailable — defaulting to green based on sufficient activity',
          method: 'heuristic',
          timestamp: now.toISOString(),
          suggestedNudge: null,
        };
      }
    }

    room.classifications.push(classification);
    await store.setJSON(`room:${sessionId}:${roomId}`, room);

    return json(200, { classification });
  } catch (error) {
    console.error('Classify error:', error);
    return json(500, { error: 'Failed to classify room' });
  }
};
