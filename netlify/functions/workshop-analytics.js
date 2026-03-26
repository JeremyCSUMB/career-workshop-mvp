/**
 * Workshop Analytics
 *
 * GET ?sessionId=xxx: Compute post-session analytics with AI analysis.
 *     Results are cached in Blobs so the AI call only runs once per session.
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

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeMetrics(session, rooms) {
  const studentNames = new Set();
  let totalWords = 0;
  let totalSubmissions = 0;
  let totalNudges = 0;
  const wordsPerRoom = [];
  const distribution = { red: 0, yellow: 0, green: 0, unclassified: 0 };
  const wordBuckets = { low: 0, medium: 0, high: 0, veryHigh: 0 };

  const roomStats = rooms.map((room) => {
    // Collect student names
    const students = [];
    if (room.students) {
      Object.values(room.students).forEach((name) => {
        if (name) {
          studentNames.add(name);
          students.push(name);
        }
      });
    }

    const submissions = room.submissions || [];
    const wordCount = submissions.reduce((sum, s) => sum + (s.wordCount || 0), 0);
    const nudgeCount = (room.nudges || []).length;
    const classifications = room.classifications || [];
    const finalClassification = classifications.length > 0 ? classifications[classifications.length - 1] : null;
    const finalStatus = finalClassification?.status || null;

    // Tally engagement distribution
    if (finalStatus === 'red') distribution.red++;
    else if (finalStatus === 'yellow') distribution.yellow++;
    else if (finalStatus === 'green') distribution.green++;
    else distribution.unclassified++;

    // Tally word buckets
    if (wordCount < 50) wordBuckets.low++;
    else if (wordCount < 150) wordBuckets.medium++;
    else if (wordCount < 300) wordBuckets.high++;
    else wordBuckets.veryHigh++;

    totalWords += wordCount;
    totalSubmissions += submissions.length;
    totalNudges += nudgeCount;
    wordsPerRoom.push(wordCount);

    const totalRounds = session.rounds || 1;

    return {
      roomId: room.id,
      students,
      finalStatus,
      totalWordCount: wordCount,
      submissionCount: submissions.length,
      avgWordCountPerSubmission: submissions.length > 0 ? Math.round(wordCount / submissions.length) : 0,
      nudgeCount,
      classificationHistory: classifications.map((c) => ({ status: c.status, timestamp: c.timestamp })),
      capabilityProfile: room.capabilityProfile || null,
      capabilityProfiles: Array.isArray(room.capabilityProfiles) ? room.capabilityProfiles : (room.capabilityProfile ? [room.capabilityProfile] : []),
      roundsCompleted: Math.min(room.currentRound || 0, totalRounds),
      totalRounds,
    };
  });

  const durationMinutes = session.endedAt && session.created
    ? Math.round((new Date(session.endedAt) - new Date(session.created)) / 60000)
    : null;

  return {
    session: {
      id: session.id,
      name: session.name,
      created: session.created,
      endedAt: session.endedAt,
      durationMinutes,
      roomCount: session.roomCount,
      studentCount: studentNames.size,
      totalRounds: session.rounds || 1,
      totalQuestions: session.questions || 1,
      prompts: session.prompts || [],
    },
    engagement: {
      distribution,
    },
    rooms: roomStats,
    aggregates: {
      totalWords,
      avgWordsPerRoom: rooms.length > 0 ? Math.round(totalWords / rooms.length) : 0,
      medianWordsPerRoom: median(wordsPerRoom),
      totalSubmissions,
      totalNudges,
      roomsWithProfiles: roomStats.filter((r) => r.capabilityProfile?.capabilities?.length).length,
      avgSubmissionsPerRoom: rooms.length > 0 ? Math.round(totalSubmissions / rooms.length) : 0,
      wordCountDistribution: wordBuckets,
    },
  };
}

function buildAiPrompt(metrics, rooms) {
  // Include truncated submission notes and capability profiles for AI context
  const roomSummaries = rooms.map((room, i) => {
    const stats = metrics.rooms[i];
    const notes = (room.submissions || [])
      .map((s) => {
        const about = s.aboutStudent ? ` about ${s.aboutStudent}` : '';
        return `[${s.studentName}${about}, ${s.round}]: ${(s.notes || '').slice(0, 200)}`;
      })
      .join('\n');
    const profile = stats.capabilityProfile?.capabilities
      ? stats.capabilityProfile.capabilities.map((c) => `- ${c.capability}: ${c.evidence}`).join('\n')
      : 'No profile generated';

    return `Room ${stats.roomId} (${stats.finalStatus || 'unclassified'}, ${stats.totalWordCount} words, ${stats.nudgeCount} nudges):\nStudents: ${stats.students.join(', ') || 'none'}\nNotes:\n${notes || 'No notes'}\nCapability Profile:\n${profile}`;
  });

  return `Session: ${metrics.session.name}
Duration: ${metrics.session.durationMinutes ?? 'unknown'} minutes
Rooms: ${metrics.session.roomCount}, Students: ${metrics.session.studentCount}
Questions: ${metrics.session.totalQuestions}, Rounds: ${metrics.session.totalRounds}

Engagement: Green ${metrics.engagement.distribution.green}, Yellow ${metrics.engagement.distribution.yellow}, Red ${metrics.engagement.distribution.red}, Unclassified ${metrics.engagement.distribution.unclassified}

Aggregates: ${metrics.aggregates.totalWords} total words, ${metrics.aggregates.avgWordsPerRoom} avg/room, ${metrics.aggregates.medianWordsPerRoom} median/room
Submissions: ${metrics.aggregates.totalSubmissions} total, ${metrics.aggregates.avgSubmissionsPerRoom} avg/room
Nudges sent: ${metrics.aggregates.totalNudges}
Rooms with profiles: ${metrics.aggregates.roomsWithProfiles}
Word distribution: <50 words: ${metrics.aggregates.wordCountDistribution.low}, 50-150: ${metrics.aggregates.wordCountDistribution.medium}, 150-300: ${metrics.aggregates.wordCountDistribution.high}, 300+: ${metrics.aggregates.wordCountDistribution.veryHigh}

--- Room Details ---
${roomSummaries.join('\n\n')}`;
}

const ANALYTICS_SYSTEM_PROMPT = `You are analyzing a completed peer interview workshop session where students paired up to interview each other about times they figured something out without clear answers. The facilitator monitored rooms with a Red/Yellow/Green engagement system.

Given the session metrics and room data, provide qualitative analysis. Return ONLY valid JSON with this exact structure:
{
  "overallAssessment": "1-2 sentence summary of how the session went overall",
  "patterns": ["pattern observed across rooms", "..."],
  "whatWorked": ["what went well", "..."],
  "areasForImprovement": ["what could be better", "..."],
  "recommendations": ["actionable suggestion for the instructor's next session", "..."],
  "capabilityHighlights": ["notable capability with evidence from standout profiles", "..."],
  "engagementNarrative": "2-3 sentences about how engagement evolved across the session"
}`;

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
    // Check cache first
    const cached = await store.get(`analytics:${sessionId}`, { type: 'json' });
    if (cached) {
      return json(200, { analytics: cached });
    }

    // Fetch session
    const session = await store.get(`session:${sessionId}`, { type: 'json' });
    if (!session) {
      return json(404, { error: 'Session not found' });
    }

    // Fetch all rooms in parallel
    const { blobs } = await store.list({ prefix: `room:${sessionId}:` });
    const rooms = (await Promise.all(
      blobs.map((blob) => store.get(blob.key, { type: 'json' }))
    )).filter(Boolean);

    // Compute quantitative metrics
    const computed = computeMetrics(session, rooms);

    // Skip AI if no activity
    let aiAnalysis;
    if (computed.aggregates.totalSubmissions === 0) {
      aiAnalysis = {
        overallAssessment: 'No activity data available for this session. Students may not have joined or submitted any notes.',
        patterns: [],
        whatWorked: [],
        areasForImprovement: [],
        recommendations: ['Ensure students have the session code and understand how to join before starting.'],
        capabilityHighlights: [],
        engagementNarrative: 'No engagement data was recorded for this session.',
      };
    } else {
      // Build prompt and call AI
      const userMessage = buildAiPrompt(computed, rooms);
      const aiText = await callClaude(ANALYTICS_SYSTEM_PROMPT, userMessage, { maxTokens: 2048 });

      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiAnalysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI did not return valid JSON');
      }
    }

    const result = {
      computed,
      aiAnalysis,
      generatedAt: new Date().toISOString(),
    };

    // Cache result
    await store.setJSON(`analytics:${sessionId}`, result);

    return json(200, { analytics: result });
  } catch (error) {
    console.error('Analytics error:', error);
    return json(500, { error: 'Failed to generate analytics' });
  }
};
