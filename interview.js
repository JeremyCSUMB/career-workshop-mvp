/**
 * Workshop MVP — Student Interview
 *
 * Handles join, waiting, interview rounds (1 & 2),
 * note submission, follow-ups, capability profiles,
 * nudge display, heartbeat, and debounced auto-save.
 */

import { WORKSHOP_CONFIG as CFG } from './config.js';

/* ============================================
   State
   ============================================ */

const state = {
  sessionId: localStorage.getItem('ws_sessionId') || '',
  roomId: localStorage.getItem('ws_roomId') || '',
  studentName: localStorage.getItem('ws_studentName') || '',
  round: parseInt(localStorage.getItem('ws_round') || '1', 10),
  phase: localStorage.getItem('ws_phase') || 'entry', // entry | waiting | interview | complete
  students: [],
  role: null,       // 'interviewer' | 'storyteller'
  partnerName: '',
  customTags: [],
};

/* ============================================
   DOM refs
   ============================================ */

const $ = (id) => document.getElementById(id);

const screens = {
  entry: $('screen-entry'),
  waiting: $('screen-waiting'),
  interview: $('screen-interview'),
  complete: $('screen-complete'),
};

/* ============================================
   Utilities
   ============================================ */

function api(endpoint, opts = {}) {
  const url = opts.params
    ? `${CFG.api_base}/${endpoint}?${new URLSearchParams(opts.params)}`
    : `${CFG.api_base}/${endpoint}`;
  const fetchOpts = { method: opts.method || 'GET' };
  if (opts.body) {
    fetchOpts.method = 'POST';
    fetchOpts.headers = { 'Content-Type': 'application/json' };
    fetchOpts.body = JSON.stringify(opts.body);
  }
  return fetch(url, fetchOpts).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.message || `Request failed (${r.status})`);
    return data;
  });
}

function persist() {
  localStorage.setItem('ws_sessionId', state.sessionId);
  localStorage.setItem('ws_roomId', state.roomId);
  localStorage.setItem('ws_studentName', state.studentName);
  localStorage.setItem('ws_round', String(state.round));
  localStorage.setItem('ws_phase', state.phase);
}

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('ws-screen--active'));
  screens[name].classList.add('ws-screen--active');
  state.phase = name;
  persist();
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('ws-hidden');
}

function hideError(el) {
  el.classList.add('ws-hidden');
}

function determineRoles(students, round) {
  const sorted = [...students].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const interviewerIdx = round === 1 ? 0 : 1;
  const storytellerIdx = round === 1 ? 1 : 0;
  return {
    interviewer: sorted[interviewerIdx],
    storyteller: sorted[storytellerIdx],
  };
}

/* ============================================
   Debounced auto-save
   ============================================ */

let debounceTimers = {};

function debouncedSave(textareaId, roundLabel) {
  clearTimeout(debounceTimers[textareaId]);
  debounceTimers[textareaId] = setTimeout(() => {
    const el = $(textareaId);
    if (!el || !el.value.trim()) return;
    api('workshop-submit', {
      body: {
        sessionId: state.sessionId,
        roomId: state.roomId,
        studentName: state.studentName,
        notes: el.value.trim(),
        round: roundLabel,
      },
    }).then(() => {
      flashAutosave(textareaId);
    }).catch(() => { /* silent */ });
  }, CFG.debounce_save_ms);
}

function flashAutosave(textareaId) {
  const indicator = $(textareaId.replace('textarea', 'autosave'));
  if (!indicator) return;
  indicator.textContent = 'Auto-saved';
  indicator.classList.add('ws-autosave--visible');
  setTimeout(() => indicator.classList.remove('ws-autosave--visible'), 2000);
}

/* ============================================
   Heartbeat
   ============================================ */

let heartbeatInterval = null;

function startHeartbeat() {
  if (heartbeatInterval) return;
  const beat = () => {
    if (!state.sessionId || !state.roomId) return;
    api('workshop-heartbeat', {
      body: { sessionId: state.sessionId, roomId: state.roomId },
    }).catch(() => { /* silent */ });
  };
  beat();
  heartbeatInterval = setInterval(beat, CFG.heartbeat_interval);
}

/* ============================================
   Nudge polling & display
   ============================================ */

let nudgeInterval = null;
let nudgeDismissTimer = null;

function startNudgePolling() {
  if (nudgeInterval) return;
  const poll = async () => {
    if (!state.sessionId || !state.roomId) return;
    try {
      const data = await api('workshop-nudge', {
        params: { sessionId: state.sessionId, roomId: state.roomId },
      });
      if (data.nudges && data.nudges.length > 0) {
        showNudge(data.nudges[data.nudges.length - 1].message);
      }
    } catch { /* silent */ }
  };
  nudgeInterval = setInterval(poll, CFG.nudge_poll_interval);
}

function showNudge(text) {
  $('nudge-text').textContent = text;
  $('nudge-banner').classList.add('ws-nudge-banner--visible');
  clearTimeout(nudgeDismissTimer);
  nudgeDismissTimer = setTimeout(dismissNudge, 30000);
}

function dismissNudge() {
  $('nudge-banner').classList.remove('ws-nudge-banner--visible');
  clearTimeout(nudgeDismissTimer);
}

/* ============================================
   Entry screen
   ============================================ */

function initEntry() {
  // Pre-fill from localStorage
  if (state.sessionId) $('entry-session').value = state.sessionId;
  if (state.roomId) $('entry-room').value = state.roomId;
  if (state.studentName) $('entry-name').value = state.studentName;

  $('btn-join').addEventListener('click', handleJoin);

  // Allow Enter key to submit
  ['entry-session', 'entry-room', 'entry-name'].forEach((id) => {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoin();
    });
  });
}

async function handleJoin() {
  const sessionId = $('entry-session').value.trim();
  const roomId = $('entry-room').value.trim();
  const studentName = $('entry-name').value.trim();
  const errEl = $('entry-error');
  hideError(errEl);

  if (!sessionId || sessionId.length < 4) {
    return showError(errEl, 'Please enter a valid session code.');
  }
  if (!roomId) {
    return showError(errEl, 'Please enter your room number.');
  }
  if (!studentName || studentName.length < 2) {
    return showError(errEl, 'Please enter your name.');
  }

  $('btn-join').disabled = true;
  $('btn-join').textContent = 'Joining...';

  try {
    await api('workshop-join', {
      body: { sessionId, roomId, studentName },
    });
    state.sessionId = sessionId;
    state.roomId = roomId;
    state.studentName = studentName;
    persist();
    startHeartbeat();
    startNudgePolling();
    showScreen('waiting');
    startWaitingPoll();
  } catch (err) {
    showError(errEl, err.message);
  } finally {
    $('btn-join').disabled = false;
    $('btn-join').textContent = 'Join Room';
  }
}

/* ============================================
   Waiting screen
   ============================================ */

let waitingPollInterval = null;

function extractStudentNames(studentsObj) {
  // Backend stores students as { student1: "Name1", student2: "Name2" }
  if (!studentsObj) return [];
  if (Array.isArray(studentsObj)) return studentsObj;
  return Object.values(studentsObj).filter(Boolean);
}

function startWaitingPoll() {
  const poll = async () => {
    try {
      const data = await api('workshop-room', {
        params: { sessionId: state.sessionId, roomId: state.roomId },
      });
      const room = data.room || data;
      state.students = extractStudentNames(room.students);

      if (state.students.length >= 2) {
        clearInterval(waitingPollInterval);
        waitingPollInterval = null;
        renderWaitingNames();
        // Brief pause so students see both names before interview starts
        setTimeout(() => startInterview(), 1500);
      } else if (state.students.length === 1) {
        $('waiting-message').textContent = 'Waiting for your partner to join...';
        $('waiting-names').classList.add('ws-hidden');
      }
    } catch { /* silent */ }
  };
  poll();
  waitingPollInterval = setInterval(poll, 3000);
}

function renderWaitingNames() {
  $('waiting-message').textContent = 'Both partners are here!';
  const namesEl = $('waiting-names');
  namesEl.innerHTML = '';
  state.students.forEach((name) => {
    const span = document.createElement('span');
    span.className = 'ws-partner-name';
    span.textContent = name;
    namesEl.appendChild(span);
  });
  namesEl.classList.remove('ws-hidden');
}

/* ============================================
   Interview screen
   ============================================ */

function startInterview() {
  const roles = determineRoles(state.students, state.round);
  state.role = roles.interviewer === state.studentName ? 'interviewer' : 'storyteller';
  state.partnerName = state.role === 'interviewer' ? roles.storyteller : roles.interviewer;

  renderInterviewHeader();

  if (state.role === 'interviewer') {
    $('interviewer-view').classList.remove('ws-hidden');
    $('storyteller-view').classList.add('ws-hidden');
    setupInterviewerPhases();
  } else {
    $('storyteller-view').classList.remove('ws-hidden');
    $('interviewer-view').classList.add('ws-hidden');
    setupStorytellerWait();
  }

  showScreen('interview');
}

function renderInterviewHeader() {
  const roles = determineRoles(state.students, state.round);
  $('round-title').textContent = `Round ${state.round} of 2`;
  $('round-roles').textContent = `${roles.interviewer} interviews ${roles.storyteller}`;
  $('round-badge').textContent = `Room ${state.roomId}`;
}

/* ============================================
   Interviewer flow
   ============================================ */

function setupInterviewerPhases() {
  // Reset visibility
  $('phase-notes').classList.remove('ws-hidden');
  $('phase-followup').classList.add('ws-hidden');
  $('phase-profile').classList.add('ws-hidden');
  $('profile-result').classList.add('ws-hidden');
  $('profile-result').classList.remove('ws-profile-card--visible');
  $('profile-done').classList.add('ws-hidden');
  $('profile-loading').classList.add('ws-hidden');
  $('notes-textarea').value = '';
  $('followup-textarea').value = '';
  $('followup-cards').innerHTML = '';
  $('profile-tags').innerHTML = '';
  $('profile-summary').textContent = '';
  state.customTags = [];

  // Debounced auto-save on notes textarea
  $('notes-textarea').oninput = () => {
    debouncedSave('notes-textarea', `round${state.round}-notes`);
  };

  $('btn-submit-notes').onclick = handleSubmitNotes;
  $('btn-submit-followup').onclick = handleSubmitFollowup;
  $('btn-end-round').onclick = handleEndRound;
  $('btn-add-tag').onclick = handleAddTag;
  $('custom-tag-input').onkeydown = (e) => {
    if (e.key === 'Enter') handleAddTag();
  };
}

async function handleSubmitNotes() {
  const notes = $('notes-textarea').value.trim();
  if (!notes) return;

  $('btn-submit-notes').disabled = true;
  $('btn-submit-notes').textContent = 'Submitting...';

  try {
    // Submit notes
    await api('workshop-submit', {
      body: {
        sessionId: state.sessionId,
        roomId: state.roomId,
        studentName: state.studentName,
        notes,
        round: `round${state.round}-notes`,
      },
    });

    // Request follow-up questions
    const followupData = await api('workshop-followup', {
      body: {
        sessionId: state.sessionId,
        roomId: state.roomId,
        notes,
      },
    });

    // Show follow-up phase
    $('phase-notes').classList.add('ws-hidden');
    $('phase-followup').classList.remove('ws-hidden');

    renderFollowupCards(followupData.questions || followupData.followups || []);

    // Debounced auto-save on follow-up textarea
    $('followup-textarea').oninput = () => {
      debouncedSave('followup-textarea', `round${state.round}-followup`);
    };
  } catch (err) {
    alert('Error submitting notes: ' + err.message);
  } finally {
    $('btn-submit-notes').disabled = false;
    $('btn-submit-notes').textContent = 'Submit Notes';
  }
}

function renderFollowupCards(questions) {
  const container = $('followup-cards');
  container.innerHTML = '';
  const items = Array.isArray(questions) ? questions : [];
  items.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'ws-followup-card';
    card.textContent = typeof q === 'string' ? q : q.question || q.text || '';
    container.appendChild(card);
    // Stagger animation
    setTimeout(() => card.classList.add('ws-followup-card--visible'), 100 + i * 150);
  });
}

async function handleSubmitFollowup() {
  const notes = $('followup-textarea').value.trim();
  if (!notes) return;

  $('btn-submit-followup').disabled = true;
  $('btn-submit-followup').textContent = 'Submitting...';

  try {
    await api('workshop-submit', {
      body: {
        sessionId: state.sessionId,
        roomId: state.roomId,
        studentName: state.studentName,
        notes,
        round: `round${state.round}-followup`,
      },
    });

    $('phase-followup').classList.add('ws-hidden');
    $('phase-profile').classList.remove('ws-hidden');
  } catch (err) {
    alert('Error submitting follow-up: ' + err.message);
  } finally {
    $('btn-submit-followup').disabled = false;
    $('btn-submit-followup').textContent = 'Submit Follow-up Notes';
  }
}

async function handleEndRound() {
  $('btn-end-round').disabled = true;
  $('btn-end-round').textContent = 'Generating...';
  $('profile-loading').classList.remove('ws-hidden');

  try {
    const data = await api('workshop-profile', {
      body: {
        sessionId: state.sessionId,
        roomId: state.roomId,
        studentName: state.partnerName,
        round: state.round,
      },
    });

    $('profile-loading').classList.add('ws-hidden');
    renderProfile(data);
  } catch (err) {
    $('profile-loading').classList.add('ws-hidden');
    alert('Error generating profile: ' + err.message);
    $('btn-end-round').disabled = false;
    $('btn-end-round').textContent = 'End Round & Generate Profile';
  }
}

function renderProfile(data) {
  const profile = data.profile || data;
  const summary = profile.summary || 'Profile generated.';
  const capabilities = profile.capabilities || [];

  $('profile-summary').textContent = summary;

  const tagsEl = $('profile-tags');
  tagsEl.innerHTML = '';
  capabilities.forEach((cap) => {
    const tag = document.createElement('div');
    tag.className = 'ws-capability-tag';
    const name = typeof cap === 'string' ? cap : cap.capability || cap.name || '';
    const evidence = typeof cap === 'object' ? (cap.evidence || '') : '';
    tag.innerHTML = `<strong>${escHtml(name)}</strong>${evidence ? `<br><span style="font-size:13px;color:var(--ci-text-muted)">${escHtml(evidence)}</span>` : ''}`;
    tagsEl.appendChild(tag);
  });

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  $('profile-result').classList.remove('ws-hidden');
  requestAnimationFrame(() => {
    $('profile-result').classList.add('ws-profile-card--visible');
  });

  $('btn-end-round').classList.add('ws-hidden');
  $('profile-done').classList.remove('ws-hidden');

  $('btn-next-round').onclick = handleNextRound;
  if (state.round >= 2) {
    $('btn-next-round').textContent = 'Finish Workshop';
  }
}

function handleAddTag() {
  const input = $('custom-tag-input');
  const tag = input.value.trim();
  if (!tag) return;

  state.customTags.push(tag);
  const span = document.createElement('span');
  span.className = 'ws-capability-tag ws-capability-tag--custom';
  span.textContent = tag;
  $('profile-tags').appendChild(span);
  input.value = '';
}

function handleNextRound() {
  if (state.round >= 2) {
    showScreen('complete');
    return;
  }
  state.round = 2;
  persist();
  startInterview();
}

/* ============================================
   Storyteller flow — wait for round to end
   ============================================ */

let storytellerPollInterval = null;

function setupStorytellerWait() {
  // The storyteller just sees the message. We could optionally poll
  // for round advancement, but for MVP the interviewer drives the flow.
  // We poll the room to detect when the interviewer moves to round 2
  // or completes.
  if (storytellerPollInterval) clearInterval(storytellerPollInterval);

  storytellerPollInterval = setInterval(async () => {
    try {
      const data = await api('workshop-room', {
        params: { sessionId: state.sessionId, roomId: state.roomId },
      });
      const room = data.room || data;
      const currentRound = room.currentRound || room.round;

      // If the room has advanced past our round, transition
      if (currentRound && currentRound > state.round) {
        clearInterval(storytellerPollInterval);
        storytellerPollInterval = null;
        state.round = currentRound;
        persist();
        startInterview();
      }
      if (currentRound >= 3) {
        clearInterval(storytellerPollInterval);
        storytellerPollInterval = null;
        showScreen('complete');
      }
    } catch { /* silent */ }
  }, 5000);
}

/* ============================================
   Resume from localStorage
   ============================================ */

function tryResume() {
  if (!state.sessionId || !state.roomId || !state.studentName) {
    showScreen('entry');
    return;
  }

  startHeartbeat();
  startNudgePolling();

  if (state.phase === 'complete') {
    showScreen('complete');
    return;
  }

  if (state.phase === 'interview') {
    // Re-fetch room to get student list
    api('workshop-room', {
      params: { sessionId: state.sessionId, roomId: state.roomId },
    }).then((data) => {
      const room = data.room || data;
      state.students = extractStudentNames(room.students);
      if (state.students.length >= 2) {
        startInterview();
      } else {
        showScreen('waiting');
        startWaitingPoll();
      }
    }).catch(() => {
      showScreen('entry');
    });
    return;
  }

  if (state.phase === 'waiting') {
    showScreen('waiting');
    startWaitingPoll();
    return;
  }

  showScreen('entry');
}

/* ============================================
   Init
   ============================================ */

function init() {
  initEntry();

  $('nudge-dismiss').addEventListener('click', dismissNudge);

  tryResume();
}

init();
