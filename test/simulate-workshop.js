#!/usr/bin/env node

/**
 * Workshop Simulation Test
 *
 * Simulates a full workshop flow against a running netlify dev server:
 *   1. Create session with 2 rooms
 *   2. Join 4 students (2 per room)
 *   3. Send heartbeats
 *   4. Submit interview notes (round 1)
 *   5. Generate follow-up questions (AI)
 *   6. Submit follow-up notes
 *   7. Classify engagement
 *   8. Check pulse endpoint
 *   9. Send & poll nudges
 *  10. Generate capability profiles (AI) — advances round
 *  11. Submit round 2 notes + profiles
 *  12. Verify dashboard endpoints (rooms, pulse, room detail)
 *  13. End session
 *  14. Fetch analytics
 *
 * Usage:
 *   node test/simulate-workshop.js [base_url]
 *   Default base_url: http://localhost:8888
 */

const BASE = process.argv[2] || 'http://localhost:8888';
const API = `${BASE}/.netlify/functions`;

// --- Helpers ---

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    const msg = detail ? `${label} — ${detail}` : label;
    failures.push(msg);
    console.log(`  ❌ ${label}${detail ? ` (${detail})` : ''}`);
  }
}

async function post(path, body, { timeout = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.name === 'AbortError' ? 'Request timed out' : err.message } };
  } finally {
    clearTimeout(timer);
  }
}

async function get(path, params = {}, { timeout = 60000 } = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${API}/${path}?${qs}` : `${API}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.name === 'AbortError' ? 'Request timed out' : err.message } };
  } finally {
    clearTimeout(timer);
  }
}

async function del(path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// Realistic interview notes
const ROUND1_NOTES_ALICE = `Marcus told me about when he was working at a coffee shop and the POS system went down during the morning rush. He said there were about 30 people in line and his manager wasn't there yet. He decided to use his phone calculator to manually track orders and had another barista write them on cups with a sharpie. He said the hardest part was figuring out the prices from memory since they had just changed the menu. He ended up looking at the mobile app to check prices. The whole thing lasted about 45 minutes and he said they only had 2 wrong orders.`;

const ROUND1_NOTES_CHARLIE = `Diana described a situation in her biology class where the lab protocol they were following had a mistake in it. The reagent concentrations were wrong and their first experiment failed. Instead of just asking the TA, she went back and compared the protocol to the textbook and realized step 3 had the wrong dilution ratio. She then recalculated the correct amounts and proposed the fix to her lab group. She said some group members wanted to just wing it but she insisted on doing the math. Their experiment ended up being one of only two groups that got valid results.`;

const FOLLOWUP_NOTES_ALICE = `When I asked Marcus about how he decided to use the phone calculator approach, he said he considered a few options first — he thought about closing the line but didn't want to lose customers. He also thought about calling his manager but knew she was 20 minutes away. He said the key insight was realizing they didn't need the full POS system, just a way to track what people owed. He mentioned that one regular customer actually helped by suggesting they use Venmo for payments which sped things up.`;

const FOLLOWUP_NOTES_CHARLIE = `Diana said the moment she realized the protocol was wrong was when the color of the solution looked different from what the textbook described. She said she felt nervous about speaking up because the TA had approved the protocol. I asked how she convinced her group and she said she showed them the math side by side — the protocol said 1:10 dilution but the textbook said 1:100. She said after that experience she always double-checks protocols before starting and has caught two more errors since then.`;

// Round 2 — roles swap
const ROUND2_NOTES_MARCUS = `Alice talked about organizing a community garden project in her neighborhood. The original plan from the city fell through because of funding cuts, so she had to figure out how to make it work with almost no budget. She reached out to local businesses for donated materials and organized weekend volunteer shifts through social media. She said the hardest part was dealing with a neighbor who kept complaining about the noise. She ended up inviting him to join the planning committee which actually turned him into one of the biggest supporters.`;

const ROUND2_NOTES_DIANA = `Charlie described debugging a networking issue in his computer science capstone project. Their team's chat application kept dropping connections after exactly 60 seconds. He spent two days reading documentation and stack overflow before realizing it was a timeout setting in the load balancer, not their code. He said what made it tricky was that the error messages pointed to their websocket code, not the infrastructure. He learned to always check the infrastructure layer first before diving into application code.`;

const FOLLOWUP_NOTES_MARCUS = `When I asked Alice what she would do differently, she said she would have started the fundraising earlier and created a formal budget from day one. She mentioned that tracking expenses on sticky notes almost caused a problem when someone questioned where the donated mulch went. She also said she learned that involving skeptics early is better than trying to work around them.`;

const FOLLOWUP_NOTES_DIANA = `Charlie explained that the 60-second timeout was actually a default in nginx's proxy configuration. He said he tried about 5 different fixes before finding the right one, including rewriting their connection handling code which turned out to be unnecessary. When I asked what debugging approach he uses now, he said he always starts by reproducing the issue with minimal code and checking each layer of the stack from bottom up.`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Main Test Flow ---

async function run() {
  console.log(`\n🔬 Workshop Simulation Test`);
  console.log(`   Target: ${API}\n`);

  let sessionId, session;

  // ─── 1. Create Session ───
  console.log('── 1. Create Session ──');
  {
    const { status, data } = await post('workshop-session', {
      name: 'Test Session (Automated)',
      roomCount: 2,
      questions: 1,
    });
    assert(status === 201, 'Session created (201)', `got ${status}`);
    assert(data.session?.id, 'Session has ID', JSON.stringify(data));
    assert(data.session?.roomCount === 2, 'Room count = 2');
    assert(data.session?.questions === 1, 'Questions = 1');
    assert(data.session?.rounds === 2, 'Rounds = 2 (questions * 2)');
    session = data.session;
    sessionId = session?.id;
    if (!sessionId) {
      console.log('\n💥 Cannot continue without session ID. Aborting.');
      process.exit(1);
    }
    console.log(`   Session ID: ${sessionId}\n`);
  }

  // ─── 2. List Sessions ───
  console.log('── 2. List Sessions ──');
  {
    const { status, data } = await get('workshop-session');
    assert(status === 200, 'List sessions (200)');
    const found = data.sessions?.find((s) => s.id === sessionId);
    assert(!!found, 'New session appears in list');
  }

  // ─── 3. Join Students ───
  console.log('\n── 3. Join Students ──');
  const students = [
    { name: 'Alice', roomId: '1' },
    { name: 'Marcus', roomId: '1' },
    { name: 'Charlie', roomId: '2' },
    { name: 'Diana', roomId: '2' },
  ];

  for (const s of students) {
    const { status, data } = await post('workshop-join', {
      sessionId,
      roomId: s.roomId,
      studentName: s.name,
    });
    assert(status === 200, `${s.name} joined room ${s.roomId}`);
  }

  // Test rejoin
  {
    const { status, data } = await post('workshop-join', {
      sessionId,
      roomId: '1',
      studentName: 'Alice',
    });
    assert(status === 200 && data.rejoined === true, 'Alice can rejoin (idempotent)');
  }

  // Test full room
  {
    const { status, data } = await post('workshop-join', {
      sessionId,
      roomId: '1',
      studentName: 'Intruder',
    });
    assert(status === 409, 'Full room rejects new student (409)', `got ${status}`);
  }

  // ─── 4. Verify Rooms ───
  console.log('\n── 4. Verify Rooms ──');
  {
    const { status, data } = await get('workshop-rooms', { sessionId });
    assert(status === 200, 'Get all rooms (200)');
    assert(data.rooms?.length === 2, `2 rooms returned (got ${data.rooms?.length})`);

    const room1 = data.rooms?.find((r) => r.id === '1');
    assert(
      room1?.students?.student1 === 'Alice' && room1?.students?.student2 === 'Marcus',
      'Room 1: Alice & Marcus'
    );

    const room2 = data.rooms?.find((r) => r.id === '2');
    assert(
      room2?.students?.student1 === 'Charlie' && room2?.students?.student2 === 'Diana',
      'Room 2: Charlie & Diana'
    );
  }

  // ─── 5. Heartbeats ───
  console.log('\n── 5. Heartbeats ──');
  for (const roomId of ['1', '2']) {
    const { status } = await post('workshop-heartbeat', { sessionId, roomId });
    assert(status === 200, `Heartbeat room ${roomId}`);
  }

  // ─── 6. Pulse Check (before submissions) ───
  console.log('\n── 6. Pulse (pre-submission) ──');
  {
    const { status, data } = await get('workshop-pulse', { sessionId });
    assert(status === 200, 'Pulse endpoint (200)');
    assert(data.rooms?.length === 2, '2 rooms in pulse');
    const r1 = data.rooms?.find((r) => r.id === '1');
    assert(r1?.studentCount === 2, 'Pulse: room 1 has 2 students');
    assert(r1?.submissionCount === 0, 'Pulse: room 1 has 0 submissions');
    assert(r1?.currentRound === 1, 'Pulse: room 1 round = 1');
  }

  // ─── 7. Round 1: Submit Initial Notes ───
  // Role assignment: alphabetical sort → first = interviewer
  // Room 1: Alice interviews Marcus (Alice < Marcus alphabetically)
  // Room 2: Charlie interviews Diana (Charlie < Diana alphabetically)
  console.log('\n── 7. Round 1: Submit Notes ──');
  {
    const { status: s1 } = await post('workshop-submit', {
      sessionId,
      roomId: '1',
      studentName: 'Alice',
      notes: ROUND1_NOTES_ALICE,
      round: 'round1-notes',
    });
    assert(s1 === 200, 'Alice submitted round 1 notes');

    const { status: s2 } = await post('workshop-submit', {
      sessionId,
      roomId: '2',
      studentName: 'Charlie',
      notes: ROUND1_NOTES_CHARLIE,
      round: 'round1-notes',
    });
    assert(s2 === 200, 'Charlie submitted round 1 notes');
  }

  // ─── 8. Generate Follow-up Questions (AI) ───
  console.log('\n── 8. Follow-up Questions (AI) ──');
  {
    const { status: s1, data: d1 } = await post('workshop-followup', {
      sessionId,
      roomId: '1',
      notes: ROUND1_NOTES_ALICE,
    });
    assert(s1 === 200, 'Follow-ups generated for room 1');
    assert(Array.isArray(d1.questions) && d1.questions.length >= 2, `Got ${d1.questions?.length} questions for room 1`);
    if (d1.questions?.length) console.log(`   Sample Q: "${d1.questions[0].slice(0, 80)}..."`);

    const { status: s2, data: d2 } = await post('workshop-followup', {
      sessionId,
      roomId: '2',
      notes: ROUND1_NOTES_CHARLIE,
    });
    assert(s2 === 200, 'Follow-ups generated for room 2');
    assert(Array.isArray(d2.questions) && d2.questions.length >= 2, `Got ${d2.questions?.length} questions for room 2`);
  }

  // ─── 9. Submit Follow-up Notes ───
  console.log('\n── 9. Submit Follow-up Notes ──');
  {
    const { status: s1 } = await post('workshop-submit', {
      sessionId,
      roomId: '1',
      studentName: 'Alice',
      notes: FOLLOWUP_NOTES_ALICE,
      round: 'round1-followup',
    });
    assert(s1 === 200, 'Alice submitted follow-up notes');

    const { status: s2 } = await post('workshop-submit', {
      sessionId,
      roomId: '2',
      studentName: 'Charlie',
      notes: FOLLOWUP_NOTES_CHARLIE,
      round: 'round1-followup',
    });
    assert(s2 === 200, 'Charlie submitted follow-up notes');
  }

  // ─── 10. Classify Engagement ───
  console.log('\n── 10. Classify Engagement ──');
  {
    const { status: s1, data: d1 } = await post('workshop-classify', {
      sessionId,
      roomId: '1',
    });
    assert(s1 === 200, 'Room 1 classified');
    assert(
      ['red', 'yellow', 'green'].includes(d1.classification?.status),
      `Room 1 status: ${d1.classification?.status}`
    );
    console.log(`   Room 1: ${d1.classification?.status} (${d1.classification?.method}) — ${d1.classification?.reasoning?.slice(0, 80)}`);

    const { status: s2, data: d2 } = await post('workshop-classify', {
      sessionId,
      roomId: '2',
    });
    assert(s2 === 200, 'Room 2 classified');
    console.log(`   Room 2: ${d2.classification?.status} (${d2.classification?.method}) — ${d2.classification?.reasoning?.slice(0, 80)}`);
  }

  // ─── 11. Nudge ───
  console.log('\n── 11. Nudge Send & Poll ──');
  {
    const { status: s1, data: d1 } = await post('workshop-nudge', {
      sessionId,
      roomId: '1',
      message: 'Try to dig deeper into the decision-making process!',
    });
    assert(s1 === 200, 'Nudge sent to room 1');
    assert(d1.nudge?.message, 'Nudge has message');

    // Poll nudges
    const { status: s2, data: d2 } = await get('workshop-nudge', {
      sessionId,
      roomId: '1',
    });
    assert(s2 === 200, 'Nudge poll (200)');
    assert(d2.nudges?.length === 1, `Got ${d2.nudges?.length} unread nudge(s)`);

    // Poll again — should be empty (marked read)
    const { status: s3, data: d3 } = await get('workshop-nudge', {
      sessionId,
      roomId: '1',
    });
    assert(d3.nudges?.length === 0, 'Second poll returns 0 (already read)');
  }

  // ─── 12. Pulse Check (after submissions) ───
  console.log('\n── 12. Pulse (post-submission) ──');
  {
    const { status, data } = await get('workshop-pulse', { sessionId });
    assert(status === 200, 'Pulse (200)');
    const r1 = data.rooms?.find((r) => r.id === '1');
    assert(r1?.submissionCount === 2, `Room 1 submissions: ${r1?.submissionCount} (expected 2)`);
    assert(r1?.wordCount > 100, `Room 1 word count: ${r1?.wordCount}`);
    assert(r1?.hasClassification === true, 'Room 1 has classification');
  }

  // ─── 13. Generate Capability Profile (Round 1) — AI ───
  // Profile is for the storyteller (Marcus in room 1, Diana in room 2)
  // The interviewer's notes (Alice about Marcus) are used
  console.log('\n── 13. Capability Profile Round 1 (AI) ──');
  {
    const { status: s1, data: d1 } = await post('workshop-profile', {
      sessionId,
      roomId: '1',
      studentName: 'Marcus',
      round: 1,
    });
    assert(s1 === 200, 'Profile generated for Marcus');
    assert(d1.profile?.capabilities?.length >= 1, `Marcus has ${d1.profile?.capabilities?.length} capabilities`);
    assert(d1.profile?.summary, 'Marcus profile has summary');
    if (d1.profile?.capabilities?.[0]) {
      console.log(`   Capability: ${d1.profile.capabilities[0].capability}`);
    }

    const { status: s2, data: d2 } = await post('workshop-profile', {
      sessionId,
      roomId: '2',
      studentName: 'Diana',
      round: 1,
    });
    assert(s2 === 200, 'Profile generated for Diana');
    assert(d2.profile?.capabilities?.length >= 1, `Diana has ${d2.profile?.capabilities?.length} capabilities`);
  }

  // ─── 14. Verify Round Advanced ───
  console.log('\n── 14. Verify Round Advanced ──');
  {
    const { status, data } = await get('workshop-room', { sessionId, roomId: '1' });
    assert(status === 200, 'Get room 1 detail');
    assert(data.room?.currentRound === 2, `Room 1 round: ${data.room?.currentRound} (expected 2)`);
    assert(data.room?.capabilityProfiles?.length >= 1, 'Room 1 has capability profile(s)');
  }

  // ─── 15. Round 2: Roles Swap ───
  // Room 1: Marcus interviews Alice / Room 2: Diana interviews Charlie
  console.log('\n── 15. Round 2: Submit Notes ──');
  {
    const { status: s1 } = await post('workshop-submit', {
      sessionId,
      roomId: '1',
      studentName: 'Marcus',
      notes: ROUND2_NOTES_MARCUS,
      round: 'round2-notes',
    });
    assert(s1 === 200, 'Marcus submitted round 2 notes');

    const { status: s2 } = await post('workshop-submit', {
      sessionId,
      roomId: '2',
      studentName: 'Diana',
      notes: ROUND2_NOTES_DIANA,
      round: 'round2-notes',
    });
    assert(s2 === 200, 'Diana submitted round 2 notes');
  }

  // ─── 16. Round 2 Follow-ups ───
  console.log('\n── 16. Round 2: Follow-up Notes ──');
  {
    const { status: s1 } = await post('workshop-submit', {
      sessionId,
      roomId: '1',
      studentName: 'Marcus',
      notes: FOLLOWUP_NOTES_MARCUS,
      round: 'round2-followup',
    });
    assert(s1 === 200, 'Marcus submitted follow-up notes');

    const { status: s2 } = await post('workshop-submit', {
      sessionId,
      roomId: '2',
      studentName: 'Diana',
      notes: FOLLOWUP_NOTES_DIANA,
      round: 'round2-followup',
    });
    assert(s2 === 200, 'Diana submitted follow-up notes');
  }

  // ─── 17. Capability Profile Round 2 ───
  console.log('\n── 17. Capability Profile Round 2 (AI) ──');
  {
    const { status: s1, data: d1 } = await post('workshop-profile', {
      sessionId,
      roomId: '1',
      studentName: 'Alice',
      round: 2,
    });
    assert(s1 === 200, 'Profile generated for Alice');
    assert(d1.profile?.capabilities?.length >= 1, `Alice has ${d1.profile?.capabilities?.length} capabilities`);

    const { status: s2, data: d2 } = await post('workshop-profile', {
      sessionId,
      roomId: '2',
      studentName: 'Charlie',
      round: 2,
    });
    assert(s2 === 200, 'Profile generated for Charlie');
    assert(d2.profile?.capabilities?.length >= 1, `Charlie has ${d2.profile?.capabilities?.length} capabilities`);
  }

  // ─── 18. Verify Session Complete ───
  console.log('\n── 18. Verify Session Complete ──');
  {
    const { data: d1 } = await get('workshop-room', { sessionId, roomId: '1' });
    assert(d1.room?.currentRound === 3, `Room 1 round: ${d1.room?.currentRound} (expected 3 = complete)`);
    assert(d1.room?.submissions?.length === 4, `Room 1 has ${d1.room?.submissions?.length} submissions (expected 4)`);
    assert(d1.room?.capabilityProfiles?.length === 2, `Room 1 has ${d1.room?.capabilityProfiles?.length} profiles (expected 2)`);

    const { data: d2 } = await get('workshop-room', { sessionId, roomId: '2' });
    assert(d2.room?.currentRound === 3, `Room 2 round: ${d2.room?.currentRound} (expected 3 = complete)`);
  }

  // ─── 19. Classify Inactive (should flag nothing — heartbeats are recent) ───
  console.log('\n── 19. Classify Inactive ──');
  {
    const { status, data } = await get('workshop-classify-inactive', { sessionId });
    assert(status === 200, 'Classify inactive (200)');
    assert(data.flagged?.length === 0, `Flagged: ${data.flagged?.length} (expected 0 — heartbeats recent)`);
  }

  // ─── 20. Leave Room ───
  console.log('\n── 20. Leave Room ──');
  {
    const { status } = await post('workshop-leave', {
      sessionId,
      roomId: '1',
      studentName: 'Alice',
    });
    assert(status === 200, 'Alice left room 1');

    const { data } = await get('workshop-room', { sessionId, roomId: '1' });
    assert(data.room?.students?.student1 === null, 'Alice slot is null after leaving');
    assert(data.room?.students?.student2 === 'Marcus', 'Marcus still in room');

    // Rejoin for cleanup consistency
    await post('workshop-join', { sessionId, roomId: '1', studentName: 'Alice' });
  }

  // ─── 21. End Session ───
  console.log('\n── 21. End Session ──');
  {
    const { status, data } = await del('workshop-session', { sessionId });
    assert(status === 200, 'Session ended');
    assert(data.ended === true, 'Confirmed ended');
  }

  // ─── 22. Analytics ───
  console.log('\n── 22. Analytics (AI) ──');
  {
    // Analytics is heavy (fetches all rooms + AI call). Netlify Dev has a 30s
    // Lambda timeout that can't be overridden locally, so the first call may
    // time out. But the AI result gets cached, so a retry succeeds.
    let status, data;
    for (let attempt = 1; attempt <= 3; attempt++) {
      ({ status, data } = await get('workshop-analytics', { sessionId }, { timeout: 60000 }));
      if (status === 200) break;
      console.log(`   ⏳ Analytics attempt ${attempt} returned ${status}, retrying in 5s...`);
      await sleep(5000);
    }
    assert(status === 200, 'Analytics (200)', `got ${status}`);
    const a = data.analytics;
    assert(a?.computed?.session?.id === sessionId, 'Analytics session ID matches');
    assert(a?.computed?.aggregates?.totalWords > 0, `Total words: ${a?.computed?.aggregates?.totalWords}`);
    assert(a?.computed?.aggregates?.totalSubmissions >= 4, `Total submissions: ${a?.computed?.aggregates?.totalSubmissions}`);
    assert(a?.aiAnalysis?.overallAssessment, 'Has AI overall assessment');
    assert(Array.isArray(a?.aiAnalysis?.patterns), 'Has patterns array');
    if (a?.aiAnalysis?.overallAssessment) {
      console.log(`   AI: ${a.aiAnalysis.overallAssessment.slice(0, 120)}...`);
    }
  }

  // ─── 23. Edge Cases ───
  console.log('\n── 23. Edge Cases ──');
  {
    // Invalid session
    const { status: s1 } = await get('workshop-rooms', { sessionId: 'nonexistent' });
    assert(s1 === 200, 'Rooms for nonexistent session returns 200 (empty)');

    // Missing fields
    const { status: s2 } = await post('workshop-join', { sessionId });
    assert(s2 === 400, 'Join with missing fields returns 400');

    const { status: s3 } = await post('workshop-submit', { sessionId });
    assert(s3 === 400, 'Submit with missing fields returns 400');

    // Invalid JSON
    const res = await fetch(`${API}/workshop-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    assert(res.status === 400, 'Invalid JSON returns 400');

    // Room not found
    const { status: s4 } = await post('workshop-join', {
      sessionId,
      roomId: '999',
      studentName: 'Ghost',
    });
    assert(s4 === 404, 'Nonexistent room returns 404');
  }

  // ═══════════════════════════════════════════════════
  // PART 2: Additional coverage tests
  // ═══════════════════════════════════════════════════
  console.log('\n\n🔬 Part 2: Additional Coverage Tests\n');

  // ─── 24. Heuristic Classification: Red (low word count) ───
  console.log('── 24. Heuristic Classification: Red ──');
  {
    // Create a fresh session with 1 room for classification tests
    const { data: sessData } = await post('workshop-session', {
      name: 'Classification Test',
      roomCount: 1,
      questions: 1,
    });
    const sid = sessData.session.id;
    console.log(`   Session ID: ${sid}`);

    // Join 2 students
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Eve' });
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Frank' });

    // Submit very short notes (< 15 words → red heuristic)
    await post('workshop-submit', {
      sessionId: sid,
      roomId: '1',
      studentName: 'Eve',
      notes: 'They talked about school.',
      round: 'round1-notes',
    });

    const { status, data } = await post('workshop-classify', { sessionId: sid, roomId: '1' });
    assert(status === 200, 'Classify red room (200)');
    assert(data.classification?.status === 'red', `Status: ${data.classification?.status} (expected red)`);
    assert(data.classification?.method === 'heuristic', `Method: ${data.classification?.method} (expected heuristic)`);
    console.log(`   ${data.classification?.status} (${data.classification?.method}) — ${data.classification?.reasoning}`);

    // Clean up
    await del('workshop-session', { sessionId: sid });
  }

  // ─── 25. Heuristic Classification: Yellow (low-ish word count) ───
  console.log('\n── 25. Heuristic Classification: Yellow ──');
  {
    const { data: sessData } = await post('workshop-session', {
      name: 'Yellow Classification Test',
      roomCount: 1,
      questions: 1,
    });
    const sid = sessData.session.id;
    console.log(`   Session ID: ${sid}`);

    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Eve' });
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Frank' });

    // Submit notes with 15-50 words → yellow heuristic
    await post('workshop-submit', {
      sessionId: sid,
      roomId: '1',
      studentName: 'Eve',
      notes: 'Frank told me about a time at work when there was a problem with the computer system and he had to figure out what was wrong. He said it was hard but he managed to fix it eventually.',
      round: 'round1-notes',
    });

    const { status, data } = await post('workshop-classify', { sessionId: sid, roomId: '1' });
    assert(status === 200, 'Classify yellow room (200)');
    assert(data.classification?.status === 'yellow', `Status: ${data.classification?.status} (expected yellow)`);
    assert(data.classification?.method === 'heuristic', `Method: ${data.classification?.method} (expected heuristic)`);
    console.log(`   ${data.classification?.status} (${data.classification?.method}) — ${data.classification?.reasoning}`);

    await del('workshop-session', { sessionId: sid });
  }

  // ─── 26. Auto-save Upsert (submit same round twice) ───
  console.log('\n── 26. Auto-save Upsert ──');
  {
    const { data: sessData } = await post('workshop-session', {
      name: 'Upsert Test',
      roomCount: 1,
      questions: 1,
    });
    const sid = sessData.session.id;
    console.log(`   Session ID: ${sid}`);

    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Eve' });
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Frank' });

    // First submission
    await post('workshop-submit', {
      sessionId: sid,
      roomId: '1',
      studentName: 'Eve',
      notes: 'First draft of notes',
      round: 'round1-notes',
    });

    // Second submission (auto-save overwrites)
    const updatedNotes = 'Updated notes with more detail about how Frank handled the situation by talking to the team.';
    await post('workshop-submit', {
      sessionId: sid,
      roomId: '1',
      studentName: 'Eve',
      notes: updatedNotes,
      round: 'round1-notes',
    });

    // Verify only 1 submission exists (not 2)
    const { data } = await get('workshop-room', { sessionId: sid, roomId: '1' });
    const eveSubmissions = data.room?.submissions?.filter(
      (s) => s.studentName === 'Eve' && s.round === 'round1-notes'
    );
    assert(eveSubmissions?.length === 1, `Upsert: ${eveSubmissions?.length} submission (expected 1, not 2)`);
    assert(
      eveSubmissions?.[0]?.notes === updatedNotes,
      'Upsert: notes updated to latest version'
    );

    await del('workshop-session', { sessionId: sid });
  }

  // ─── 27. Inactivity Detection (stale heartbeats) ───
  console.log('\n── 27. Inactivity Detection ──');
  {
    const { data: sessData } = await post('workshop-session', {
      name: 'Inactivity Test',
      roomCount: 1,
      questions: 1,
    });
    const sid = sessData.session.id;
    console.log(`   Session ID: ${sid}`);

    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Eve' });
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Frank' });

    // Send a heartbeat, then manually backdate it via submit (which sets lastHeartbeat)
    await post('workshop-heartbeat', { sessionId: sid, roomId: '1' });

    // Now manually set a stale heartbeat by reading the room and backdating
    // We can't directly set the heartbeat via the API, but we can check that
    // the classify-inactive endpoint works with "fresh" heartbeats first
    const { data: freshCheck } = await get('workshop-classify-inactive', { sessionId: sid });
    assert(freshCheck.flagged?.length === 0, 'Fresh heartbeat: 0 flagged (correct)');

    // To test stale heartbeat detection, we'll need to manipulate the data.
    // Since we can't backdate via API, let's verify the logic works by checking
    // that rooms with NO heartbeat and students get skipped (the function
    // skips rooms without heartbeats)
    const { data: sessData2 } = await post('workshop-session', {
      name: 'Inactivity Test 2',
      roomCount: 1,
      questions: 1,
    });
    const sid2 = sessData2.session.id;
    // Join but never send heartbeat
    await post('workshop-join', { sessionId: sid2, roomId: '1', studentName: 'Ghost' });
    const { data: noHeartbeatCheck } = await get('workshop-classify-inactive', { sessionId: sid2 });
    assert(
      noHeartbeatCheck.flagged?.length === 0,
      'No heartbeat room: 0 flagged (skipped correctly — never started)'
    );

    await del('workshop-session', { sessionId: sid });
    await del('workshop-session', { sessionId: sid2 });
  }

  // ─── 28. Multi-question Session ───
  console.log('\n── 28. Multi-question Session ──');
  {
    const { status, data: sessData } = await post('workshop-session', {
      name: 'Multi-Question Test',
      roomCount: 1,
      questions: 3,
      prompts: [
        'Tell me about a problem you solved.',
        'Describe a time you led a team.',
        'When did you learn something new quickly?',
      ],
    });
    const sess = sessData.session;
    assert(status === 201, 'Multi-question session created');
    assert(sess?.questions === 3, `Questions: ${sess?.questions} (expected 3)`);
    assert(sess?.rounds === 6, `Rounds: ${sess?.rounds} (expected 6 = 3 * 2)`);
    assert(sess?.prompts?.length === 3, `Prompts: ${sess?.prompts?.length} (expected 3)`);
    assert(sess?.prompts?.[1] === 'Describe a time you led a team.', 'Custom prompt preserved');
    console.log(`   Session ID: ${sess?.id}, ${sess?.questions} questions, ${sess?.rounds} rounds`);

    // Verify rooms endpoint returns the correct rounds and prompts
    const sid = sess.id;
    const { data: roomsData } = await get('workshop-rooms', { sessionId: sid });
    assert(roomsData.rounds === 6, `Rooms endpoint rounds: ${roomsData.rounds} (expected 6)`);
    assert(roomsData.prompts?.length === 3, `Rooms endpoint prompts: ${roomsData.prompts?.length}`);

    await del('workshop-session', { sessionId: sid });
  }

  // ─── 29. Session with Default Prompts ───
  console.log('\n── 29. Session Default Prompts ──');
  {
    const { data: sessData } = await post('workshop-session', {
      name: 'Default Prompt Test',
      roomCount: 1,
      questions: 2,
      // No prompts provided — should use defaults
    });
    const sess = sessData.session;
    assert(sess?.prompts?.length === 2, `Default prompts: ${sess?.prompts?.length} (expected 2)`);
    assert(
      sess?.prompts?.[0]?.includes('figure something out'),
      'Default prompt contains expected text'
    );
    assert(sess?.prompts?.[1]?.includes('figure something out'), 'Second prompt also defaults');

    await del('workshop-session', { sessionId: sess.id });
  }

  // ─── 30. Profile with No Matching Notes (400) ───
  console.log('\n── 30. Profile with No Notes ──');
  {
    const { data: sessData } = await post('workshop-session', {
      name: 'No Notes Profile Test',
      roomCount: 1,
      questions: 1,
    });
    const sid = sessData.session.id;

    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Eve' });
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Frank' });

    // Try to generate profile without any submissions
    const { status, data } = await post('workshop-profile', {
      sessionId: sid,
      roomId: '1',
      studentName: 'Frank',
      round: 1,
    });
    assert(status === 400, `Profile with no notes: ${status} (expected 400)`);
    assert(
      data.error?.includes('No interview notes'),
      `Error message: "${data.error?.slice(0, 60)}"`
    );

    await del('workshop-session', { sessionId: sid });
  }

  // ─── 31. Follow-ups with Minimal Notes ───
  console.log('\n── 31. Follow-ups with Minimal Notes (AI) ──');
  {
    const { data: sessData } = await post('workshop-session', {
      name: 'Minimal Notes Test',
      roomCount: 1,
      questions: 1,
    });
    const sid = sessData.session.id;

    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Eve' });
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Frank' });

    // Very short notes — AI should still return questions
    const { status, data } = await post('workshop-followup', {
      sessionId: sid,
      roomId: '1',
      notes: 'They fixed a bug at work.',
    });
    assert(status === 200, 'Follow-up with minimal notes (200)');
    assert(Array.isArray(data.questions) && data.questions.length >= 1, `Got ${data.questions?.length} questions even from minimal notes`);

    await del('workshop-session', { sessionId: sid });
  }

  // ─── 32. Analytics Caching ───
  console.log('\n── 32. Analytics Caching ──');
  {
    // Re-fetch analytics for the main session (should be cached from test 22)
    const start = Date.now();
    let status, data;
    for (let attempt = 1; attempt <= 2; attempt++) {
      ({ status, data } = await get('workshop-analytics', { sessionId }, { timeout: 60000 }));
      if (status === 200) break;
      await sleep(3000);
    }
    const elapsed = Date.now() - start;
    assert(status === 200, 'Cached analytics (200)');
    assert(data.analytics?.computed?.session?.id === sessionId, 'Cached analytics matches session');
    // Cached response should be fast (< 5s) since no AI call needed
    assert(elapsed < 5000, `Cached response in ${elapsed}ms (expected < 5000ms)`);
    console.log(`   Cached analytics returned in ${elapsed}ms`);
  }

  // ─── 33. Leave Non-existent Student ───
  console.log('\n── 33. Leave Edge Cases ──');
  {
    // Try to leave with a student not in the room
    const { status } = await post('workshop-leave', {
      sessionId,
      roomId: '1',
      studentName: 'Nobody',
    });
    assert(status === 404, `Leave unknown student: ${status} (expected 404)`);
  }

  // ─── 34. Multiple Nudges ───
  console.log('\n── 34. Multiple Nudges ──');
  {
    const { data: sessData } = await post('workshop-session', {
      name: 'Multi Nudge Test',
      roomCount: 1,
      questions: 1,
    });
    const sid = sessData.session.id;
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Eve' });
    await post('workshop-join', { sessionId: sid, roomId: '1', studentName: 'Frank' });

    // Send 3 nudges
    await post('workshop-nudge', { sessionId: sid, roomId: '1', message: 'Nudge 1' });
    await post('workshop-nudge', { sessionId: sid, roomId: '1', message: 'Nudge 2' });
    await post('workshop-nudge', { sessionId: sid, roomId: '1', message: 'Nudge 3' });

    // Poll — should get all 3
    const { data: d1 } = await get('workshop-nudge', { sessionId: sid, roomId: '1' });
    assert(d1.nudges?.length === 3, `Got ${d1.nudges?.length} nudges (expected 3)`);
    assert(d1.nudges?.[0]?.message === 'Nudge 1', 'First nudge correct');
    assert(d1.nudges?.[2]?.message === 'Nudge 3', 'Third nudge correct');

    // Poll again — all read
    const { data: d2 } = await get('workshop-nudge', { sessionId: sid, roomId: '1' });
    assert(d2.nudges?.length === 0, `Second poll: ${d2.nudges?.length} (expected 0 — all read)`);

    await del('workshop-session', { sessionId: sid });
  }

  // ─── 35. Session Validation Edge Cases ───
  console.log('\n── 35. Session Validation ──');
  {
    // Missing name
    const { status: s1 } = await post('workshop-session', { roomCount: 2 });
    assert(s1 === 400, `No name: ${s1} (expected 400)`);

    // Missing roomCount
    const { status: s2 } = await post('workshop-session', { name: 'Test' });
    assert(s2 === 400, `No roomCount: ${s2} (expected 400)`);

    // roomCount = 0
    const { status: s3 } = await post('workshop-session', { name: 'Test', roomCount: 0 });
    assert(s3 === 400, `roomCount=0: ${s3} (expected 400)`);

    // End non-existent session
    const { status: s4 } = await del('workshop-session', { sessionId: 'zzzzzz' });
    assert(s4 === 404, `End non-existent session: ${s4} (expected 404)`);
  }

  // ─── 36. Heartbeat & Nudge Missing Fields ───
  console.log('\n── 36. Missing Field Validation ──');
  {
    const { status: s1 } = await post('workshop-heartbeat', { sessionId: 'x' });
    assert(s1 === 400, `Heartbeat missing roomId: ${s1} (expected 400)`);

    const { status: s2 } = await post('workshop-nudge', { sessionId: 'x', roomId: '1' });
    assert(s2 === 400, `Nudge missing message: ${s2} (expected 400)`);

    const { status: s3 } = await post('workshop-followup', { sessionId: 'x', roomId: '1' });
    assert(s3 === 400, `Follow-up missing notes: ${s3} (expected 400)`);

    const { status: s4 } = await post('workshop-profile', { sessionId: 'x', roomId: '1' });
    assert(s4 === 400, `Profile missing studentName/round: ${s4} (expected 400)`);

    const { status: s5 } = await post('workshop-leave', { sessionId: 'x' });
    assert(s5 === 400, `Leave missing fields: ${s5} (expected 400)`);
  }

  // ─── 37. Pulse & Rooms for Ended Session ───
  console.log('\n── 37. Ended Session Still Readable ──');
  {
    // The main session was ended in test 21 — verify data is still accessible
    const { status: s1, data: d1 } = await get('workshop-pulse', { sessionId });
    assert(s1 === 200, 'Pulse on ended session (200)');
    assert(d1.rooms?.length === 2, `Ended session still has ${d1.rooms?.length} rooms`);

    const { status: s2, data: d2 } = await get('workshop-rooms', { sessionId });
    assert(s2 === 200, 'Rooms on ended session (200)');
    assert(d2.rooms?.length === 2, 'Room data preserved after end');

    // Verify session is marked ended
    const { data: d3 } = await get('workshop-session');
    const endedSession = d3.sessions?.find((s) => s.id === sessionId);
    assert(endedSession?.ended === true, 'Session marked as ended');
    assert(!!endedSession?.endedAt, 'Session has endedAt timestamp');
  }

  // ─── Summary ───
  console.log('\n' + '═'.repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log('═'.repeat(50) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\n💥 Unexpected error:', err);
  process.exit(1);
});
