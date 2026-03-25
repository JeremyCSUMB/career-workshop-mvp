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
  totalRounds: parseInt(localStorage.getItem('ws_totalRounds') || '1', 10),
  prompts: JSON.parse(localStorage.getItem('ws_prompts') || '[]'),
};

/* ============================================
   DOM refs
   ============================================ */

const $ = (id) => document.getElementById(id);

const screens = {
  entry: $('screen-entry'),
  rooms: $('screen-rooms'),
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
  localStorage.setItem('ws_totalRounds', String(state.totalRounds));
  if (state.prompts.length > 0) localStorage.setItem('ws_prompts', JSON.stringify(state.prompts));
}

function currentQuestion() {
  return Math.ceil(state.round / 2);
}

function totalQuestions() {
  return Math.ceil(state.totalRounds / 2);
}

function questionTurn() {
  return ((state.round - 1) % 2) + 1;
}

function applyPrompt() {
  const promptIndex = Math.floor((state.round - 1) / 2);
  const prompt = state.prompts[promptIndex];
  if (prompt) {
    $('interview-prompt').textContent = prompt;
  }
}

function showScreen(name) {
  const current = Object.values(screens).find((s) => s.classList.contains('ws-screen--active'));
  const next = screens[name];

  if (current && current !== next) {
    current.classList.remove('ws-screen--active');
    current.classList.add('ws-screen--exiting');
    current.addEventListener('animationend', function handler() {
      current.classList.remove('ws-screen--exiting');
      current.removeEventListener('animationend', handler);
    }, { once: true });
    // Slight delay so exit starts before enter
    setTimeout(() => next.classList.add('ws-screen--active'), 80);
  } else {
    Object.values(screens).forEach((s) => s.classList.remove('ws-screen--active'));
    next.classList.add('ws-screen--active');
  }

  state.phase = name;
  persist();

  // Show leave button when in a session (not on entry screen)
  const leaveBtn = $('btn-leave-session');
  if (leaveBtn) {
    if (name === 'entry') {
      leaveBtn.classList.add('ws-hidden');
    } else {
      leaveBtn.classList.remove('ws-hidden');
    }
  }

  // Load profiles when reaching complete screen
  if (name === 'complete') {
    loadCompleteProfiles();
  }

  updateBottomNav(name);
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
  const interviewerIdx = round % 2 === 1 ? 0 : 1;
  const storytellerIdx = round % 2 === 1 ? 1 : 0;
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

const MIN_CHARS = 80;

function updateCounter(textareaId) {
  const el = $(textareaId);
  const counterId = textareaId.replace('textarea', 'counter');
  const counter = $(counterId);
  if (!el || !counter) return;
  const text = el.value;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const remaining = MIN_CHARS - chars;
  if (remaining > 0) {
    counter.textContent = `${chars} / ${MIN_CHARS} characters · ${words} words — ${remaining} more needed`;
    counter.classList.add('ws-char-counter--short');
  } else {
    counter.textContent = `${chars} characters · ${words} words`;
    counter.classList.remove('ws-char-counter--short');
  }
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
  // Check for ?code= URL parameter to auto-fill session code (shareable join link)
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  if (codeParam) {
    state.sessionId = codeParam;
    // Clean the URL without reloading so the param doesn't persist on refresh
    window.history.replaceState({}, '', window.location.pathname);
    // Lock the session code field so it can't be accidentally changed
    const sessionInput = $('entry-session');
    sessionInput.value = codeParam;
    sessionInput.disabled = true;
    sessionInput.style.opacity = '0.7';
    sessionInput.style.cursor = 'not-allowed';
  }

  if (state.sessionId && !$('entry-session').disabled) $('entry-session').value = state.sessionId;
  if (state.studentName) $('entry-name').value = state.studentName;

  // If code came from URL and we already have a saved name, auto-submit
  if (codeParam && state.studentName) {
    handleFindRooms();
  }

  $('btn-find-rooms').addEventListener('click', handleFindRooms);

  ['entry-session', 'entry-name'].forEach((id) => {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleFindRooms();
    });
  });
}

async function handleFindRooms() {
  const sessionId = $('entry-session').value.trim();
  const studentName = $('entry-name').value.trim();
  const errEl = $('entry-error');
  hideError(errEl);

  if (!sessionId || sessionId.length < 4) {
    return showError(errEl, 'Please enter a valid session code.');
  }
  if (!studentName || studentName.length < 2) {
    return showError(errEl, 'Please enter your name.');
  }

  $('btn-find-rooms').disabled = true;
  $('btn-find-rooms').textContent = 'Loading...';

  try {
    const data = await api('workshop-rooms', { params: { sessionId } });
    const rooms = data.rooms || [];
    if (rooms.length === 0) {
      return showError(errEl, 'No rooms found for that session code.');
    }

    state.sessionId = sessionId;
    state.studentName = studentName;
    if (data.rounds) state.totalRounds = data.rounds;
    if (data.prompts) state.prompts = data.prompts;
    persist();
    renderRoomPicker(rooms);
    showScreen('rooms');
  } catch (err) {
    showError(errEl, err.message);
  } finally {
    $('btn-find-rooms').disabled = false;
    $('btn-find-rooms').textContent = 'Find Rooms';
  }
}

function renderRoomPicker(rooms) {
  const grid = $('rooms-grid');
  grid.innerHTML = '';

  rooms.forEach((room) => {
    const names = extractStudentNames(room.students);
    const count = names.length;
    const isFull = count >= 2;
    const alreadyIn = names.includes(state.studentName);

    const card = document.createElement('div');
    card.className = 'ws-room-pick' + (isFull && !alreadyIn ? ' ws-room-pick--full' : '') + (alreadyIn ? ' ws-room-pick--yours' : '');

    let statusText = 'Empty';
    if (count === 1) statusText = '1 / 2';
    if (count >= 2) statusText = 'Full';

    card.innerHTML = `
      <div class="ws-room-pick__number">Room ${room.id}</div>
      <div class="ws-room-pick__status">${statusText}</div>
      <div class="ws-room-pick__names">${names.length > 0 ? names.map(n => `<span>${escHtml(n)}</span>`).join('') : '<span style="color:var(--ci-text-muted)">No one yet</span>'}</div>
      ${alreadyIn ? '<div class="ws-room-pick__badge">You are here — click to rejoin</div>' : ''}
    `;

    if (!isFull || alreadyIn) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => joinRoom(room.id));
    }

    grid.appendChild(card);
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function joinRoom(roomId) {
  const errEl = $('rooms-error');
  hideError(errEl);

  try {
    const data = await api('workshop-join', {
      body: { sessionId: state.sessionId, roomId: String(roomId), studentName: state.studentName },
    });
    state.roomId = String(roomId);

    // On rejoin, restore round from room state so we land in the right phase
    const room = data.room || data;
    if (data.rejoined) {
      const currentRound = room.currentRound || 1;
      if (currentRound > state.totalRounds) {
        state.round = state.totalRounds;
        persist();
        startHeartbeat();
        startNudgePolling();
        showScreen('complete');
        return;
      }
      state.round = currentRound;
    }

    persist();
    startHeartbeat();
    startNudgePolling();

    // Check if partner is already present to skip waiting screen
    state.students = extractStudentNames(room.students);
    if (state.students.length >= 2) {
      startInterview();
    } else {
      showScreen('waiting');
      startWaitingPoll();
    }
  } catch (err) {
    showError(errEl, err.message);
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
  applyPrompt();

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
  $('round-title').textContent = `Question ${currentQuestion()} of ${totalQuestions()} · Turn ${questionTurn()} of 2`;
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

  // Debounced auto-save and character counter on notes textarea
  $('notes-textarea').oninput = () => {
    updateCounter('notes-textarea');
    debouncedSave('notes-textarea', `round${state.round}-notes`);
  };
  updateCounter('notes-textarea');

  $('btn-submit-notes').onclick = handleSubmitNotes;
  $('btn-more-questions').onclick = handleMoreQuestions;
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
  if (notes.length < MIN_CHARS) {
    $('notes-textarea').focus();
    updateCounter('notes-textarea');
    return;
  }

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

    // Debounced auto-save and character counter on follow-up textarea
    $('followup-textarea').oninput = () => {
      updateCounter('followup-textarea');
      debouncedSave('followup-textarea', `round${state.round}-followup`);
    };
    updateCounter('followup-textarea');
  } catch (err) {
    alert('Error submitting notes: ' + err.message);
  } finally {
    $('btn-submit-notes').disabled = false;
    $('btn-submit-notes').textContent = 'Submit Notes';
  }
}

async function handleMoreQuestions() {
  const notes = $('notes-textarea').value.trim();
  const followupNotes = $('followup-textarea').value.trim();
  // Combine original notes with any follow-up notes for better context
  const combined = followupNotes ? `${notes}\n\nFollow-up notes:\n${followupNotes}` : notes;
  if (!combined) return;

  $('btn-more-questions').disabled = true;
  $('btn-more-questions').textContent = 'Generating...';

  try {
    const followupData = await api('workshop-followup', {
      body: {
        sessionId: state.sessionId,
        roomId: state.roomId,
        notes: combined,
        regenerate: true,
      },
    });

    renderFollowupCards(followupData.questions || followupData.followups || []);
  } catch (err) {
    alert('Error generating questions: ' + err.message);
  } finally {
    $('btn-more-questions').disabled = false;
    $('btn-more-questions').textContent = 'Generate More Questions';
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
  if (notes.length < MIN_CHARS) {
    $('followup-textarea').focus();
    updateCounter('followup-textarea');
    return;
  }

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
  if (state.round >= state.totalRounds) {
    $('btn-next-round').textContent = 'Finish Workshop';
  } else if (questionTurn() === 1) {
    // Mid-question: next turn is same question, swapped roles
    $('btn-next-round').textContent = 'Switch Roles';
  } else {
    // End of question: moving to next question
    $('btn-next-round').textContent = `Continue to Question ${currentQuestion() + 1}`;
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
  if (state.round >= state.totalRounds) {
    showScreen('complete');
    return;
  }
  state.round = state.round + 1;
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
      if (currentRound > state.totalRounds) {
        clearInterval(storytellerPollInterval);
        storytellerPollInterval = null;
        showScreen('complete');
      }
    } catch { /* silent */ }
  }, 5000);
}

/* ============================================
   Complete screen — profile preview & PDF
   ============================================ */

let completeProfilesLoaded = false;

async function loadCompleteProfiles() {
  if (completeProfilesLoaded) return;
  $('complete-loading').classList.remove('ws-hidden');

  try {
    const data = await api('workshop-room', {
      params: { sessionId: state.sessionId, roomId: state.roomId },
    });
    const room = data.room || data;
    const profiles = room.capabilityProfiles || (room.capabilityProfile ? [room.capabilityProfile] : []);
    const myProfiles = profiles.filter(p => p.studentName === state.studentName);

    renderCompleteProfiles(myProfiles);
    completeProfilesLoaded = true;
  } catch {
    $('complete-profiles').innerHTML = '<p style="color:var(--ci-text-muted);font-size:14px;">Could not load profiles. You can still download them.</p>';
  } finally {
    $('complete-loading').classList.add('ws-hidden');
  }
}

function renderCompleteProfiles(profiles) {
  const container = $('complete-profiles');
  if (profiles.length === 0) {
    container.innerHTML = '<p style="color:var(--ci-text-muted);font-size:14px;">No capability profiles found for you yet.</p>';
    return;
  }
  container.innerHTML = profiles.map((p, i) => `
    <div class="ws-profile-card ws-profile-card--visible" style="margin-top:16px;">
      <h3>Round ${p.round} Profile</h3>
      <p>${escHtml(p.summary || '')}</p>
      <div class="ws-capability-tags">
        ${(p.capabilities || []).map(cap => {
          const name = typeof cap === 'string' ? cap : cap.capability || cap.name || '';
          const evidence = typeof cap === 'object' ? (cap.evidence || '') : '';
          return `<div class="ws-capability-tag"><strong>${escHtml(name)}</strong>${evidence ? `<br><span style="font-size:13px;color:var(--ci-text-muted)">${escHtml(evidence)}</span>` : ''}</div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

async function handleDownloadPDF() {
  $('btn-download-pdf').disabled = true;
  $('btn-download-pdf').textContent = 'Preparing...';

  try {
    const data = await api('workshop-room', {
      params: { sessionId: state.sessionId, roomId: state.roomId },
    });
    const room = data.room || data;
    const profiles = room.capabilityProfiles || (room.capabilityProfile ? [room.capabilityProfile] : []);
    const myProfiles = profiles.filter(p => p.studentName === state.studentName);

    if (myProfiles.length === 0) {
      alert('No capability profiles found for you yet.');
      return;
    }

    openPDFWindow(myProfiles);
  } catch (err) {
    alert('Error loading profiles: ' + err.message);
  } finally {
    $('btn-download-pdf').disabled = false;
    $('btn-download-pdf').textContent = 'Download Your Profile (PDF)';
  }
}

function openPDFWindow(profiles) {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const profilesHTML = profiles.map(p => {
    const caps = (p.capabilities || []).map(cap => {
      const name = typeof cap === 'string' ? cap : cap.capability || cap.name || '';
      const evidence = typeof cap === 'object' ? (cap.evidence || '') : '';
      return `<div class="cap-item">
        <div class="cap-name">${esc(name)}</div>
        ${evidence ? `<div class="cap-evidence">${esc(evidence)}</div>` : ''}
      </div>`;
    }).join('');

    return `
      <div class="profile-section">
        <h2>Round ${p.round}</h2>
        <p class="summary">${esc(p.summary || '')}</p>
        <h3>Capabilities Identified</h3>
        <div class="capabilities">${caps}</div>
      </div>
    `;
  }).join('<hr>');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Capability Profile — ${esc(state.studentName)}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #1a1a2e;
    line-height: 1.6;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  .header {
    text-align: center;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 3px solid #6c63ff;
  }
  .header h1 {
    font-size: 28px;
    color: #6c63ff;
    margin-bottom: 4px;
  }
  .header .subtitle {
    font-size: 14px;
    color: #666;
  }
  .student-name {
    font-size: 22px;
    font-weight: 600;
    margin-top: 8px;
    color: #1a1a2e;
  }
  .profile-section {
    margin: 24px 0;
  }
  .profile-section h2 {
    font-size: 18px;
    color: #6c63ff;
    margin-bottom: 8px;
  }
  .profile-section h3 {
    font-size: 15px;
    color: #444;
    margin: 16px 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .summary {
    font-size: 15px;
    color: #333;
    margin-bottom: 8px;
    font-style: italic;
  }
  .capabilities {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cap-item {
    padding: 12px 16px;
    background: #f4f3ff;
    border-left: 4px solid #6c63ff;
    border-radius: 4px;
  }
  .cap-name {
    font-weight: 600;
    font-size: 15px;
    color: #1a1a2e;
  }
  .cap-evidence {
    font-size: 13px;
    color: #555;
    margin-top: 4px;
  }
  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 28px 0;
  }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #ddd;
    text-align: center;
    font-size: 12px;
    color: #999;
  }
  .print-bar {
    text-align: center;
    padding: 16px;
    margin-bottom: 24px;
    background: #f8f8ff;
    border-radius: 8px;
  }
  .print-bar button {
    background: #6c63ff;
    color: #fff;
    border: none;
    padding: 10px 28px;
    border-radius: 6px;
    font-size: 15px;
    cursor: pointer;
    font-weight: 600;
  }
  .print-bar button:hover { background: #5548d9; }
  .print-bar p {
    font-size: 13px;
    color: #666;
    margin-top: 6px;
  }
  @media print {
    .print-bar { display: none; }
    body { padding: 0; }
    .cap-item { break-inside: avoid; }
    .profile-section { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="print-bar">
    <button onclick="window.print()">Save as PDF</button>
    <p>Use your browser's "Save as PDF" option in the print dialog.</p>
  </div>
  <div class="header">
    <h1>Capability Profile</h1>
    <div class="subtitle">Career Intelligence Workshop</div>
    <div class="student-name">${esc(state.studentName)}</div>
    <div class="subtitle">${esc(dateStr)}</div>
  </div>
  ${profilesHTML}
  <div class="footer">
    Generated by Career Intelligence Workshop &middot; ${esc(dateStr)}
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert('Pop-up blocked. Please allow pop-ups for this site.');
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
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

  if (state.phase === 'rooms') {
    // Re-fetch rooms and show picker
    api('workshop-rooms', { params: { sessionId: state.sessionId } })
      .then((data) => {
        if (data.rounds) state.totalRounds = data.rounds;
        if (data.prompts) state.prompts = data.prompts;
        persist();
        renderRoomPicker(data.rooms || []);
        showScreen('rooms');
      })
      .catch(() => showScreen('entry'));
    return;
  }

  showScreen('entry');
}

/* ============================================
   Theme Toggle
   ============================================ */

function initTheme() {
  const saved = localStorage.getItem('ws_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);

  $('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ws_theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = $('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
}

/* ============================================
   Init
   ============================================ */

async function changeRoom() {
  // Stop polling intervals for the current room
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
  if (waitingPollInterval) { clearInterval(waitingPollInterval); waitingPollInterval = null; }

  // Remove student from current room on the backend
  try {
    await api('workshop-leave', {
      body: { sessionId: state.sessionId, roomId: state.roomId, studentName: state.studentName },
    });
  } catch { /* proceed even if this fails */ }

  // Clear room-specific state but keep session & name
  state.roomId = '';
  state.round = 1;
  state.students = [];
  state.role = null;
  state.partnerName = '';
  persist();

  // Fetch rooms and show picker
  try {
    const data = await api('workshop-rooms', { params: { sessionId: state.sessionId } });
    const rooms = data.rooms || [];
    renderRoomPicker(rooms);
    showScreen('rooms');
  } catch {
    // If rooms fetch fails, fall back to entry
    showScreen('entry');
  }
}

function leaveSession() {
  // Stop all intervals
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
  if (waitingPollInterval) { clearInterval(waitingPollInterval); waitingPollInterval = null; }
  if (storytellerPollInterval) { clearInterval(storytellerPollInterval); storytellerPollInterval = null; }
  Object.values(debounceTimers).forEach(clearTimeout);
  debounceTimers = {};

  // Clear state
  state.sessionId = '';
  state.roomId = '';
  state.studentName = '';
  state.round = 1;
  state.phase = 'entry';
  state.students = [];
  state.role = null;
  state.partnerName = '';
  state.customTags = [];
  state.totalRounds = 1;
  state.prompts = [];
  completeProfilesLoaded = false;

  // Clear localStorage
  ['ws_sessionId', 'ws_roomId', 'ws_studentName', 'ws_round', 'ws_phase', 'ws_totalRounds', 'ws_prompts'].forEach(k => localStorage.removeItem(k));

  // Reset form inputs
  $('entry-session').value = '';
  $('entry-name').value = '';

  // Hide leave button, show entry
  $('btn-leave-session').classList.add('ws-hidden');
  showScreen('entry');
}

function switchSession() {
  // Leave current room on the backend (best-effort)
  if (state.sessionId && state.roomId) {
    api('workshop-leave', {
      body: { sessionId: state.sessionId, roomId: state.roomId, studentName: state.studentName },
    }).catch(() => {});
  }

  // Stop all intervals
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
  if (waitingPollInterval) { clearInterval(waitingPollInterval); waitingPollInterval = null; }
  if (storytellerPollInterval) { clearInterval(storytellerPollInterval); storytellerPollInterval = null; }
  Object.values(debounceTimers).forEach(clearTimeout);
  debounceTimers = {};

  // Keep studentName but clear session-specific state
  const savedName = state.studentName;
  state.sessionId = '';
  state.roomId = '';
  state.round = 1;
  state.phase = 'entry';
  state.students = [];
  state.role = null;
  state.partnerName = '';
  state.customTags = [];
  state.totalRounds = 1;
  state.prompts = [];

  ['ws_sessionId', 'ws_roomId', 'ws_round', 'ws_phase', 'ws_totalRounds', 'ws_prompts'].forEach(k => localStorage.removeItem(k));

  // Pre-fill name so they only need to enter a new session code
  state.studentName = savedName;
  localStorage.setItem('ws_studentName', savedName);
  $('entry-session').value = '';
  $('entry-name').value = savedName;

  showScreen('entry');
}

/* ============================================
   Mobile Bottom Nav
   ============================================ */

function updateBottomNav(screenName) {
  const nav = $('bottom-nav');
  if (!nav) return;

  // Show nav when user is in a session (not on entry/rooms)
  if (['entry', 'rooms'].includes(screenName)) {
    nav.classList.add('ws-hidden');
    return;
  }
  nav.classList.remove('ws-hidden');

  // Map screens to nav items
  const navMap = { waiting: 'home', interview: 'interview', complete: 'profile' };
  const activeNav = navMap[screenName] || 'home';

  nav.querySelectorAll('.ws-bottom-nav__item').forEach((btn) => {
    btn.classList.toggle('ws-bottom-nav__item--active', btn.dataset.nav === activeNav);
  });
}

function initBottomNav() {
  const nav = $('bottom-nav');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.ws-bottom-nav__item');
    if (!btn) return;

    const target = btn.dataset.nav;
    if (target === 'home') {
      // Go to waiting or rooms depending on state
      if (state.students && state.students.length >= 2) {
        showScreen('interview');
      } else if (state.roomId) {
        showScreen('waiting');
      } else {
        showScreen('rooms');
      }
    } else if (target === 'interview') {
      if (state.phase === 'interview' || state.phase === 'waiting') {
        showScreen(state.phase);
      }
    } else if (target === 'profile') {
      if (state.phase === 'complete') {
        showScreen('complete');
      }
    }
  });
}

function init() {
  initTheme();
  initEntry();
  initBottomNav();

  $('nudge-dismiss').addEventListener('click', dismissNudge);
  $('btn-leave-session').addEventListener('click', leaveSession);
  $('btn-leave-complete').addEventListener('click', leaveSession);
  $('btn-change-room').addEventListener('click', changeRoom);
  $('btn-change-room-interview').addEventListener('click', changeRoom);
  $('btn-change-room-complete').addEventListener('click', changeRoom);
  $('btn-switch-session').addEventListener('click', switchSession);
  $('btn-switch-session-complete').addEventListener('click', switchSession);
  $('btn-download-pdf').addEventListener('click', handleDownloadPDF);

  tryResume();
}

init();
