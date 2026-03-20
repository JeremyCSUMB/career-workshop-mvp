/**
 * Workshop MVP — Facilitator Dashboard
 *
 * Login, session creation/monitoring, room cards grid,
 * overview bar, nudge modal, auto-refresh with classification.
 */

import { WORKSHOP_CONFIG as CFG } from './config.js';

/* ============================================
   State
   ============================================ */

const state = {
  authenticated: false,
  sessionId: '',
  rooms: [],
  lastClassifyTimestamps: {},   // roomId -> ISO string of last classified submission
  refreshInterval: null,
  inactivityInterval: null,
  nudgeTargetRoomId: null,
};

/* ============================================
   DOM helpers
   ============================================ */

const $ = (id) => document.getElementById(id);

const screens = {
  login: $('screen-login'),
  session: $('screen-session'),
  dashboard: $('screen-dashboard'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('ws-screen--active'));
  screens[name].classList.add('ws-screen--active');
  if (name === 'dashboard') {
    $('overview-bar').classList.remove('ws-hidden');
  } else {
    $('overview-bar').classList.add('ws-hidden');
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('ws-hidden');
}

function hideError(el) {
  el.classList.add('ws-hidden');
}

/* ============================================
   API helper
   ============================================ */

function api(endpoint, opts = {}) {
  const url = opts.params
    ? `${CFG.api_base}/${endpoint}?${new URLSearchParams(opts.params)}`
    : `${CFG.api_base}/${endpoint}`;
  const fetchOpts = { method: opts.method || 'GET' };
  if (opts.body) {
    if (!opts.method) fetchOpts.method = 'POST';
    fetchOpts.headers = { 'Content-Type': 'application/json' };
    fetchOpts.body = JSON.stringify(opts.body);
  }
  return fetch(url, fetchOpts).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.message || `Request failed (${r.status})`);
    return data;
  });
}

/* ============================================
   Time formatting
   ============================================ */

function relativeTime(isoOrMs) {
  if (!isoOrMs) return '—';
  const then = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  const diff = Math.max(0, Date.now() - then);
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function elapsedSince(isoOrMs) {
  if (!isoOrMs) return '';
  const then = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/* ============================================
   Login
   ============================================ */

function initLogin() {
  $('btn-login').addEventListener('click', handleLogin);
  $('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

function handleLogin() {
  const pw = $('login-password').value;
  if (pw === CFG.dashboard_password) {
    state.authenticated = true;
    sessionStorage.setItem('ws_dash_auth', 'true');
    showScreen('session');
    loadSessions();
  } else {
    showError($('login-error'), 'Incorrect password.');
  }
}

/* ============================================
   Session management
   ============================================ */

function initSession() {
  $('btn-create-session').addEventListener('click', handleCreateSession);
}

async function handleCreateSession() {
  const name = $('new-session-name').value.trim();
  const roomCount = parseInt($('new-room-count').value, 10);
  const errEl = $('create-error');
  hideError(errEl);

  if (!name) return showError(errEl, 'Please enter a session name.');
  if (!roomCount || roomCount < 1) return showError(errEl, 'Please enter a valid room count.');

  $('btn-create-session').disabled = true;
  $('btn-create-session').textContent = 'Creating...';

  try {
    const data = await api('workshop-session', {
      body: { name, roomCount },
    });
    state.sessionId = data.session?.id || data.sessionId || data.id;
    $('dash-subtitle').textContent = `Session: ${state.sessionId} — Share this code with students`;
    startMonitoring();
  } catch (err) {
    showError(errEl, err.message);
  } finally {
    $('btn-create-session').disabled = false;
    $('btn-create-session').textContent = 'Create Session';
  }
}

/* ============================================
   Session list, download, end
   ============================================ */

async function loadSessions() {
  const list = $('sessions-list');
  const loading = $('sessions-loading');
  try {
    const data = await api('workshop-session');
    const sessions = data.sessions || [];
    if (loading) loading.classList.add('ws-hidden');
    list.innerHTML = '';
    if (sessions.length === 0) {
      list.innerHTML = '<p style="color:var(--ci-text-muted);font-size:14px;">No active sessions. Create one above.</p>';
      return;
    }
    sessions.sort((a, b) => new Date(b.created) - new Date(a.created));
    sessions.forEach(s => {
      const card = document.createElement('div');
      card.className = 'ws-session-card';
      card.innerHTML = `
        <div class="ws-session-card__top">
          <div>
            <div class="ws-session-card__name">${escHtml(s.name)}</div>
            <div class="ws-session-card__meta">${s.roomCount} rooms &middot; Created ${relativeTime(s.created)}</div>
          </div>
          <div class="ws-session-card__code">${escHtml(s.id)}</div>
        </div>
        <div class="ws-session-card__actions">
          <button class="ws-btn ws-btn--small" data-monitor-id="${escAttr(s.id)}">Monitor</button>
          <button class="ws-btn ws-btn--small ws-btn--secondary" data-download-id="${escAttr(s.id)}">Download JSON</button>
          <button class="ws-btn ws-btn--small ws-btn--danger" data-end-id="${escAttr(s.id)}">End Session</button>
        </div>
      `;
      card.querySelector('[data-monitor-id]').addEventListener('click', () => {
        state.sessionId = s.id;
        $('dash-subtitle').textContent = `Session: ${s.id} - ${escHtml(s.name)}`;
        startMonitoring();
      });
      card.querySelector('[data-download-id]').addEventListener('click', () => downloadSessionJSON(s.id, s.name));
      card.querySelector('[data-end-id]').addEventListener('click', () => endSession(s.id, s.name));
      list.appendChild(card);
    });
  } catch (err) {
    if (loading) loading.textContent = 'Failed to load sessions.';
  }
}

async function downloadSessionJSON(sessionId, sessionName) {
  try {
    const data = await api('workshop-rooms', { params: { sessionId } });
    const rooms = data.rooms || [];
    const exportData = {
      sessionId,
      sessionName: sessionName || sessionId,
      exportedAt: new Date().toISOString(),
      rooms: rooms.map(r => ({
        roomId: r.id,
        students: r.students,
        currentRound: r.currentRound,
        submissions: r.submissions,
        aiFollowUps: r.aiFollowUps,
        capabilityProfile: r.capabilityProfile,
        classifications: r.classifications,
        nudges: r.nudges,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workshop-${sessionId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error downloading: ' + err.message);
  }
}

async function endSession(sessionId, sessionName) {
  if (!confirm(`End session "${sessionName || sessionId}"? This will delete all session data.`)) return;
  try {
    await api('workshop-session', {
      method: 'DELETE',
      body: { sessionId },
    });
    loadSessions();
  } catch (err) {
    alert('Error ending session: ' + err.message);
  }
}

/* ============================================
   Monitoring loop
   ============================================ */

function startMonitoring() {
  sessionStorage.setItem('ws_dash_sessionId', state.sessionId);
  showScreen('dashboard');
  refreshRooms();
  state.refreshInterval = setInterval(refreshRooms, CFG.dashboard_refresh_interval);
  state.inactivityInterval = setInterval(checkInactivity, CFG.inactivity_check_interval);
}

function extractStudentNames(studentsObj) {
  if (!studentsObj) return [];
  if (Array.isArray(studentsObj)) return studentsObj;
  return Object.values(studentsObj).filter(Boolean);
}

function getRoomStatus(room) {
  const classifications = room.classifications || [];
  if (classifications.length === 0) return { status: '', reasoning: '', suggestedNudge: null };
  const latest = classifications[classifications.length - 1];
  return {
    status: (latest.status || '').toLowerCase(),
    reasoning: latest.reasoning || '',
    suggestedNudge: latest.suggestedNudge || null,
  };
}

function getRoomWordCount(room) {
  return (room.submissions || []).reduce((sum, s) => sum + (s.wordCount || 0), 0);
}

function getLatestNotes(room) {
  const subs = room.submissions || [];
  if (subs.length === 0) return '';
  return subs[subs.length - 1].notes || '';
}

function getLastInputTime(room) {
  return room.lastInputTime || null;
}

async function refreshRooms() {
  try {
    const data = await api('workshop-rooms', {
      params: { sessionId: state.sessionId },
    });
    const rooms = data.rooms || data || [];
    state.rooms = Array.isArray(rooms) ? rooms : [];

    // Enrich rooms with computed fields
    state.rooms.forEach((room) => {
      const cls = getRoomStatus(room);
      room._status = cls.status;
      room._reasoning = cls.reasoning;
      room._suggestedNudge = cls.suggestedNudge;
      room._wordCount = getRoomWordCount(room);
      room._latestNotes = getLatestNotes(room);
      room._lastInputTime = getLastInputTime(room);
      room._studentNames = extractStudentNames(room.students);
    });

    // Classify rooms that have new submissions
    await classifyNewSubmissions();

    renderOverview();
    renderRoomGrid();
  } catch { /* silent */ }
}

async function classifyNewSubmissions() {
  for (const room of state.rooms) {
    const roomId = room.id;
    const lastSubmission = room.lastInputTime;
    const lastClassified = state.lastClassifyTimestamps[roomId];

    // Only classify if there are submissions and they're newer than last classify
    if (lastSubmission && lastSubmission !== lastClassified && room.submissions && room.submissions.length > 0) {
      try {
        const result = await api('workshop-classify', {
          body: { sessionId: state.sessionId, roomId },
        });
        const cls = result.classification || result;
        room._status = (cls.status || '').toLowerCase();
        room._reasoning = cls.reasoning || '';
        room._suggestedNudge = cls.suggestedNudge || null;
        state.lastClassifyTimestamps[roomId] = lastSubmission;
      } catch { /* silent */ }
    }
  }
}

async function checkInactivity() {
  try {
    await api('workshop-classify-inactive', {
      params: { sessionId: state.sessionId },
    });
  } catch { /* silent */ }
}

/* ============================================
   Overview bar
   ============================================ */

function renderOverview() {
  const rooms = state.rooms;
  const total = rooms.length;
  let red = 0, yellow = 0, green = 0;

  rooms.forEach((r) => {
    const s = r._status || '';
    if (s === 'red') red++;
    else if (s === 'yellow') yellow++;
    else if (s === 'green') green++;
  });

  $('ov-total').textContent = total;
  $('ov-red').textContent = red;
  $('ov-yellow').textContent = yellow;
  $('ov-green').textContent = green;

  // Dot strip
  const strip = $('ov-dot-strip');
  strip.innerHTML = '';
  const sorted = sortRooms(rooms);
  sorted.forEach((r) => {
    const dot = document.createElement('div');
    dot.className = 'ws-dot-strip__dot';
    const s = r._status || '';
    if (s === 'red') dot.style.background = 'var(--ws-red)';
    else if (s === 'yellow') dot.style.background = 'var(--ws-yellow)';
    else if (s === 'green') dot.style.background = 'var(--ws-green)';
    else dot.style.background = '#ccc';
    strip.appendChild(dot);
  });
}

/* ============================================
   Room cards
   ============================================ */

function sortRooms(rooms) {
  const order = { red: 0, yellow: 1, green: 2 };
  return [...rooms].sort((a, b) => {
    const oa = order[a._status] ?? 3;
    const ob = order[b._status] ?? 3;
    if (oa !== ob) return oa - ob;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function renderRoomGrid() {
  const grid = $('room-grid');
  grid.innerHTML = '';
  const sorted = sortRooms(state.rooms);

  sorted.forEach((room) => {
    grid.appendChild(createRoomCard(room));
  });
}

function createRoomCard(room) {
  const roomId = room.id || '?';
  const studentNames = room._studentNames || [];
  const status = room._status || '';
  const statusLabel = status || 'pending';
  const round = room.currentRound || 1;
  const wordCount = room._wordCount || 0;
  const lastInput = room._lastInputTime;
  const preview = room._latestNotes || '';
  const reasoning = room._reasoning || '';
  const roundStartedAt = room.roundStartTime;

  // Determine who is interviewing
  let interviewerName = '';
  let storytellerName = '';
  if (studentNames.length >= 2) {
    const sortedNames = [...studentNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const r = typeof round === 'number' ? round : 1;
    interviewerName = r === 1 ? sortedNames[0] : sortedNames[1];
    storytellerName = r === 1 ? sortedNames[1] : sortedNames[0];
  }

  const card = document.createElement('div');
  card.className = 'ws-room-card';

  const statusClass = status === 'red' ? '--red' : status === 'yellow' ? '--yellow' : status === 'green' ? '--green' : '--grey';

  card.innerHTML = `
    <div class="ws-room-card__top">
      <div class="ws-room-card__id">Room ${roomId}</div>
      <div class="ws-room-card__status ws-room-card__status${statusClass}">
        <span class="ws-room-card__status-dot"></span>
        ${statusLabel}
      </div>
    </div>
    <div class="ws-room-card__students">
      ${studentNames.length === 0 ? '<em style="color:var(--ci-text-muted);">No students yet</em>' : ''}
      ${interviewerName ? `<strong>${escHtml(interviewerName)}</strong> interviewing <strong>${escHtml(storytellerName)}</strong>` : studentNames.map((n) => `<strong>${escHtml(n)}</strong>`).join(', ')}
    </div>
    <div class="ws-room-card__meta">
      <span class="ws-room-card__meta-item">Round ${round}</span>
      ${roundStartedAt ? `<span class="ws-room-card__meta-item">${elapsedSince(roundStartedAt)} elapsed</span>` : ''}
      <span class="ws-room-card__meta-item">${wordCount} words</span>
      <span class="ws-room-card__meta-item">${relativeTime(lastInput)}</span>
    </div>
    ${preview ? `<div class="ws-room-card__preview ws-room-card__preview--collapsed" data-full="${escAttr(preview)}">${escHtml(preview.slice(0, 150))}${preview.length > 150 ? '...' : ''}</div>` : ''}
    ${reasoning ? `<div class="ws-room-card__reasoning">${escHtml(reasoning)}</div>` : ''}
    <div class="ws-room-card__actions">
      <button class="ws-btn ws-btn--small ws-btn--secondary" data-nudge-room="${roomId}">Send Nudge</button>
    </div>
  `;

  // Expand/collapse preview
  const previewEl = card.querySelector('.ws-room-card__preview');
  if (previewEl) {
    previewEl.addEventListener('click', () => {
      if (previewEl.classList.contains('ws-room-card__preview--collapsed')) {
        previewEl.classList.remove('ws-room-card__preview--collapsed');
        previewEl.classList.add('ws-room-card__preview--expanded');
        previewEl.textContent = previewEl.dataset.full;
      } else {
        previewEl.classList.remove('ws-room-card__preview--expanded');
        previewEl.classList.add('ws-room-card__preview--collapsed');
        const full = previewEl.dataset.full;
        previewEl.textContent = full.slice(0, 150) + (full.length > 150 ? '...' : '');
      }
    });
  }

  // Nudge button
  const nudgeBtn = card.querySelector('[data-nudge-room]');
  nudgeBtn.addEventListener('click', () => openNudgeModal(roomId));

  return card;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================
   Nudge modal
   ============================================ */

const NUDGE_SUGGESTIONS = [
  'Translate what your partner DID into what an employer would value. Not "good communicator" but "de-escalated a customer conflict without manager support."',
  'Ask your partner: what was the hardest part of that situation? What did you try first?',
  'Try to get more specific \u2014 names, timelines, outcomes.',
];

function initNudgeModal() {
  // Suggestion buttons
  document.querySelectorAll('.ws-nudge-suggestion').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      $('nudge-custom').value = NUDGE_SUGGESTIONS[idx];
      // Highlight selected
      document.querySelectorAll('.ws-nudge-suggestion').forEach((b) => b.classList.remove('ws-nudge-suggestion--selected'));
      btn.classList.add('ws-nudge-suggestion--selected');
    });
  });

  $('btn-nudge-cancel').addEventListener('click', closeNudgeModal);
  $('btn-nudge-send').addEventListener('click', handleSendNudge);

  // Close on overlay click
  $('nudge-modal').addEventListener('click', (e) => {
    if (e.target === $('nudge-modal')) closeNudgeModal();
  });
}

function openNudgeModal(roomId) {
  state.nudgeTargetRoomId = roomId;
  $('nudge-modal-target').textContent = `To Room ${roomId}`;
  $('nudge-custom').value = '';
  document.querySelectorAll('.ws-nudge-suggestion').forEach((b) => b.classList.remove('ws-nudge-suggestion--selected'));
  $('nudge-modal').classList.add('ws-modal-overlay--visible');
}

function closeNudgeModal() {
  $('nudge-modal').classList.remove('ws-modal-overlay--visible');
  state.nudgeTargetRoomId = null;
}

async function handleSendNudge() {
  const message = $('nudge-custom').value.trim();
  if (!message) return;

  $('btn-nudge-send').disabled = true;
  $('btn-nudge-send').textContent = 'Sending...';

  try {
    await api('workshop-nudge', {
      body: {
        sessionId: state.sessionId,
        roomId: state.nudgeTargetRoomId,
        message,
      },
    });
    closeNudgeModal();
  } catch (err) {
    alert('Error sending nudge: ' + err.message);
  } finally {
    $('btn-nudge-send').disabled = false;
    $('btn-nudge-send').textContent = 'Send Nudge';
  }
}

/* ============================================
   Init
   ============================================ */

function tryResume() {
  const wasAuth = sessionStorage.getItem('ws_dash_auth') === 'true';
  const savedSession = sessionStorage.getItem('ws_dash_sessionId');

  if (wasAuth && savedSession) {
    state.authenticated = true;
    state.sessionId = savedSession;
    $('dash-subtitle').textContent = `Session: ${state.sessionId}`;
    startMonitoring();
  } else if (wasAuth) {
    state.authenticated = true;
    showScreen('session');
    loadSessions();
  }
}

function init() {
  initLogin();
  initSession();
  initNudgeModal();

  $('btn-back-sessions').addEventListener('click', () => {
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    if (state.inactivityInterval) clearInterval(state.inactivityInterval);
    state.refreshInterval = null;
    state.inactivityInterval = null;
    state.sessionId = '';
    sessionStorage.removeItem('ws_dash_sessionId');
    $('dash-subtitle').textContent = 'Facilitator view';
    loadSessions();
    showScreen('session');
  });

  $('btn-download-json').addEventListener('click', () => {
    if (state.sessionId) downloadSessionJSON(state.sessionId, '');
  });

  tryResume();
}

init();
