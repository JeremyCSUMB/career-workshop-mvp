/**
 * Workshop MVP — Facilitator Dashboard
 *
 * Real-time monitoring with lightweight pulse polling (2s),
 * selective room fetching, DOM diffing, and live activity indicators.
 *
 * Inspired by Pear Deck's approach: frequent lightweight checks,
 * full data only when something changes, visual feedback that
 * makes updates feel instantaneous.
 */

import { WORKSHOP_CONFIG as CFG } from './config.js';

/* ============================================
   State
   ============================================ */

const state = {
  authenticated: false,
  sessionId: '',
  rooms: [],                        // Full room data (fetched selectively)
  roomIndex: {},                     // roomId -> index in rooms[]
  lastPulse: {},                     // roomId -> last pulse snapshot
  lastClassifyTimestamps: {},        // roomId -> ISO string
  dirtyRooms: new Set(),             // rooms that changed since last full fetch
  pulseInterval: null,
  fullRefreshInterval: null,
  classifyInterval: null,
  inactivityInterval: null,
  nudgeTargetRoomId: null,
  lastFullRefresh: 0,
};

/* ============================================
   DOM helpers
   ============================================ */

const $ = (id) => document.getElementById(id);

const screens = {
  login: $('screen-login'),
  session: $('screen-session'),
  dashboard: $('screen-dashboard'),
  analytics: $('screen-analytics'),
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

function showSessionSubtitle(sessionId) {
  const el = $('dash-subtitle');
  el.innerHTML = '';
  el.appendChild(document.createTextNode(`Session: ${sessionId} — `));
  const btn = document.createElement('button');
  btn.className = 'ws-link-btn';
  btn.textContent = 'Copy Join Link';
  btn.addEventListener('click', () => copyJoinLink(sessionId, btn));
  el.appendChild(btn);
}

/* ============================================
   Join-link helper
   ============================================ */

function getJoinLink(sessionId) {
  const base = window.location.origin;
  return `${base}/interview.html?code=${encodeURIComponent(sessionId)}`;
}

function copyJoinLink(sessionId, btnEl) {
  const link = getJoinLink(sessionId);
  navigator.clipboard.writeText(link).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = 'Copied!';
    setTimeout(() => { btnEl.textContent = orig; }, 1500);
  });
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
  if (secs < 5) return 'just now';
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

const DEFAULT_PROMPT = 'Tell your partner about a time you had to figure something out where there wasn\'t a clear answer. Any context \u2014 work, school, personal. Don\'t pick the most impressive story. Pick what comes to mind first. 3-4 minutes.';

function initSession() {
  $('btn-create-session').addEventListener('click', handleCreateSession);
  $('new-round-count').addEventListener('change', renderRoundPromptFields);
  $('new-round-count').addEventListener('input', renderRoundPromptFields);
  renderRoundPromptFields();
}

function renderRoundPromptFields() {
  const count = Math.max(1, Math.min(10, parseInt($('new-round-count').value, 10) || 1));
  const container = $('round-prompts-container');

  // Preserve existing values
  const existing = {};
  container.querySelectorAll('textarea').forEach((ta) => {
    existing[ta.dataset.round] = ta.value;
  });

  container.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:12px;';
    wrapper.innerHTML = `
      <label class="ws-label" style="font-size:13px;margin-bottom:4px;">Question ${i}</label>
      <textarea class="ws-textarea" data-round="${i}" style="min-height:60px;" placeholder="Leave blank to use the default prompt">${existing[String(i)] !== undefined ? escHtml(existing[String(i)]) : escHtml(DEFAULT_PROMPT)}</textarea>
    `;
    container.appendChild(wrapper);
  }
}

async function handleCreateSession() {
  const name = $('new-session-name').value.trim();
  const roomCount = parseInt($('new-room-count').value, 10);
  const questionCount = Math.max(1, Math.min(10, parseInt($('new-round-count').value, 10) || 1));
  const errEl = $('create-error');
  hideError(errEl);

  if (!name) return showError(errEl, 'Please enter a session name.');
  if (!roomCount || roomCount < 1) return showError(errEl, 'Please enter a valid room count.');

  // Collect per-question prompts
  const prompts = [];
  const container = $('round-prompts-container');
  for (let i = 1; i <= questionCount; i++) {
    const ta = container.querySelector(`textarea[data-round="${i}"]`);
    const val = ta ? ta.value.trim() : '';
    prompts.push(val || DEFAULT_PROMPT);
  }

  $('btn-create-session').disabled = true;
  $('btn-create-session').textContent = 'Creating...';

  try {
    const data = await api('workshop-session', {
      body: { name, roomCount, rounds: questionCount * 2, questions: questionCount, prompts },
    });
    state.sessionId = data.session?.id || data.sessionId || data.id;
    showSessionSubtitle(state.sessionId);
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
  const prevList = $('previous-list');
  const prevSection = $('previous-section');
  const loading = $('sessions-loading');
  try {
    const data = await api('workshop-session');
    const sessions = data.sessions || [];
    if (loading) loading.classList.add('ws-hidden');
    list.innerHTML = '';
    prevList.innerHTML = '';

    const live = sessions.filter(s => !s.ended).sort((a, b) => new Date(b.created) - new Date(a.created));
    const ended = sessions.filter(s => s.ended).sort((a, b) => new Date(b.endedAt || b.created) - new Date(a.endedAt || a.created));

    if (live.length === 0) {
      list.innerHTML = '<p style="color:var(--ci-text-muted);font-size:14px;">No active sessions. Create one above.</p>';
    }
    live.forEach(s => list.appendChild(buildSessionCard(s, false)));

    if (ended.length > 0) {
      prevSection.classList.remove('ws-hidden');
      ended.forEach(s => prevList.appendChild(buildSessionCard(s, true)));
    } else {
      prevSection.classList.add('ws-hidden');
    }
  } catch (err) {
    if (loading) loading.textContent = 'Failed to load sessions.';
  }
}

function buildSessionCard(s, isEnded) {
  const card = document.createElement('div');
  card.className = 'ws-session-card' + (isEnded ? ' ws-session-card--ended' : '');

  const endedLabel = isEnded && s.endedAt ? ` &middot; Ended ${relativeTime(s.endedAt)}` : '';

  card.innerHTML = `
    <div class="ws-session-card__top">
      <div>
        <div class="ws-session-card__name">${escHtml(s.name)}${isEnded ? ' <span style="font-size:12px;color:var(--ci-text-muted);font-weight:400;">(ended)</span>' : ''}</div>
        <div class="ws-session-card__meta">${s.roomCount} rooms &middot; Created ${relativeTime(s.created)}${endedLabel}</div>
      </div>
      <div class="ws-session-card__code">${escHtml(s.id)}</div>
    </div>
    <div class="ws-session-card__actions">
      ${isEnded ? '' : `<button class="ws-btn ws-btn--small" data-monitor-id="${escAttr(s.id)}">Monitor</button>`}
      ${isEnded ? '' : `<button class="ws-btn ws-btn--small ws-btn--secondary" data-copy-link-id="${escAttr(s.id)}">Copy Join Link</button>`}
      ${isEnded ? `<button class="ws-btn ws-btn--small" data-analytics-id="${escAttr(s.id)}" data-analytics-name="${escAttr(s.name)}">View Analytics</button>` : ''}
      <button class="ws-btn ws-btn--small ws-btn--secondary" data-download-id="${escAttr(s.id)}">Download JSON</button>
      ${isEnded ? '' : `<button class="ws-btn ws-btn--small ws-btn--danger" data-end-id="${escAttr(s.id)}">End Session</button>`}
    </div>
  `;

  const monitorBtn = card.querySelector('[data-monitor-id]');
  if (monitorBtn) {
    monitorBtn.addEventListener('click', () => {
      state.sessionId = s.id;
      showSessionSubtitle(s.id);
      startMonitoring();
    });
  }
  const copyLinkBtn = card.querySelector('[data-copy-link-id]');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => copyJoinLink(s.id, copyLinkBtn));
  }
  card.querySelector('[data-download-id]').addEventListener('click', () => downloadSessionJSON(s.id, s.name));
  const analyticsBtn = card.querySelector('[data-analytics-id]');
  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => loadAnalytics(s.id, s.name));
  }
  const endBtn = card.querySelector('[data-end-id]');
  if (endBtn) {
    endBtn.addEventListener('click', () => endSession(s.id, s.name));
  }

  return card;
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
   Post-Session Analytics
   ============================================ */

const analyticsCache = {};
let analyticsSessionId = '';

async function loadAnalytics(sessionId, sessionName) {
  analyticsSessionId = sessionId;
  showScreen('analytics');
  $('analytics-loading').classList.remove('ws-hidden');
  $('analytics-content').classList.add('ws-hidden');

  try {
    if (analyticsCache[sessionId]) {
      renderAnalytics(analyticsCache[sessionId], sessionName);
      return;
    }

    const data = await api('workshop-analytics', { params: { sessionId } });
    analyticsCache[sessionId] = data.analytics;
    renderAnalytics(data.analytics, sessionName);
  } catch (err) {
    $('analytics-loading').innerHTML = `
      <div class="ws-error" style="margin-bottom:12px;">Failed to load analytics: ${escHtml(err.message)}</div>
      <button class="ws-btn ws-btn--secondary ws-btn--small" id="btn-analytics-retry">Retry</button>
    `;
    $('btn-analytics-retry').addEventListener('click', () => loadAnalytics(sessionId, sessionName));
  }
}

function renderAnalytics(analytics, sessionName) {
  $('analytics-loading').classList.add('ws-hidden');
  $('analytics-content').classList.remove('ws-hidden');

  const { computed, aiAnalysis } = analytics;

  // Session Overview
  $('analytics-session-name').textContent = sessionName || computed.session.name || computed.session.id;

  const stats = [
    { value: formatAnalyticsDate(computed.session.created), label: 'Date' },
    { value: computed.session.durationMinutes != null ? computed.session.durationMinutes + 'm' : '\u2014', label: 'Duration' },
    { value: computed.session.roomCount, label: 'Rooms' },
    { value: computed.session.studentCount, label: 'Students' },
    { value: computed.session.totalQuestions, label: 'Questions' },
    { value: computed.aggregates.totalWords.toLocaleString(), label: 'Total Words' },
  ];
  $('analytics-overview-stats').innerHTML = stats.map(s =>
    `<div class="ws-analytics-stat"><span class="ws-analytics-stat__value">${s.value}</span><span class="ws-analytics-stat__label">${s.label}</span></div>`
  ).join('');

  renderEngagementBreakdown(computed.engagement);
  renderAiInsights(aiAnalysis);
  renderAnalyticsRoomGrid(computed.rooms);
  renderCapabilityHighlights(computed.rooms, aiAnalysis.capabilityHighlights);
}

function renderEngagementBreakdown(engagement) {
  const d = engagement.distribution;
  const total = d.red + d.yellow + d.green + d.unclassified;
  if (total === 0) {
    $('analytics-engagement').innerHTML = '<p style="color:var(--ci-text-muted);">No engagement data.</p>';
    return;
  }

  const segments = [
    { cls: 'green', count: d.green },
    { cls: 'yellow', count: d.yellow },
    { cls: 'red', count: d.red },
    { cls: 'grey', count: d.unclassified },
  ].filter(s => s.count > 0);

  const bar = `<div class="ws-analytics-bar">${segments.map(s =>
    `<div class="ws-analytics-bar__seg ws-analytics-bar__seg--${s.cls}" style="width:${(s.count / total) * 100}%"></div>`
  ).join('')}</div>`;

  const legend = `<div class="ws-analytics-legend">
    <span class="ws-analytics-legend__item"><span class="ws-overview__dot ws-overview__dot--green"></span> Green: ${d.green}</span>
    <span class="ws-analytics-legend__item"><span class="ws-overview__dot ws-overview__dot--yellow"></span> Yellow: ${d.yellow}</span>
    <span class="ws-analytics-legend__item"><span class="ws-overview__dot ws-overview__dot--red"></span> Red: ${d.red}</span>
    ${d.unclassified > 0 ? `<span class="ws-analytics-legend__item"><span class="ws-overview__dot" style="background:var(--ci-text-muted);"></span> Unclassified: ${d.unclassified}</span>` : ''}
  </div>`;

  $('analytics-engagement').innerHTML = bar + legend;
}

function renderAiInsights(ai) {
  const parts = [];

  if (ai.overallAssessment) {
    parts.push(`<p class="ws-analytics-assessment">${escHtml(ai.overallAssessment)}</p>`);
  }
  if (ai.engagementNarrative) {
    parts.push(`<p style="color:var(--ci-text-muted);font-size:15px;margin:0 0 16px;">${escHtml(ai.engagementNarrative)}</p>`);
  }
  const sections = [
    { title: 'Patterns Observed', items: ai.patterns },
    { title: 'What Worked', items: ai.whatWorked },
    { title: 'Areas for Improvement', items: ai.areasForImprovement },
    { title: 'Recommendations', items: ai.recommendations },
  ];
  for (const sec of sections) {
    if (sec.items?.length) {
      parts.push(`<h4 class="ws-analytics-subhead">${sec.title}</h4><ul class="ws-analytics-list">${sec.items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`);
    }
  }

  $('analytics-ai-insights').innerHTML = parts.join('');
}

let currentRoomData = [];

function renderAnalyticsRoomGrid(rooms) {
  currentRoomData = rooms;

  $('analytics-sort-row').innerHTML = `
    <button class="ws-btn ws-btn--small ws-btn--secondary ws-analytics-sort--active" data-sort="status">By Status</button>
    <button class="ws-btn ws-btn--small ws-btn--secondary" data-sort="words">By Word Count</button>
    <button class="ws-btn ws-btn--small ws-btn--secondary" data-sort="room">By Room #</button>
  `;

  $('analytics-sort-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    $('analytics-sort-row').querySelectorAll('button').forEach(b => b.classList.remove('ws-analytics-sort--active'));
    btn.classList.add('ws-analytics-sort--active');
    renderRoomCards(currentRoomData, btn.dataset.sort);
  });

  renderRoomCards(rooms, 'status');
}

function renderRoomCards(rooms, sortBy) {
  const statusOrder = { red: 0, yellow: 1, green: 2 };
  const sorted = [...rooms].sort((a, b) => {
    if (sortBy === 'status') return (statusOrder[a.finalStatus] ?? 3) - (statusOrder[b.finalStatus] ?? 3);
    if (sortBy === 'words') return (b.totalWordCount || 0) - (a.totalWordCount || 0);
    return String(a.roomId).localeCompare(String(b.roomId), undefined, { numeric: true });
  });

  $('analytics-room-grid').innerHTML = sorted.map(room => {
    const sc = room.finalStatus || 'none';
    return `
      <div class="ws-analytics-room-card">
        <div class="ws-analytics-room-card__top">
          <span class="ws-analytics-room-card__id">Room ${escHtml(String(room.roomId))}</span>
          <span class="ws-room-card__status ws-room-card__status--${sc}"><span class="ws-room-card__status-dot"></span>${sc}</span>
        </div>
        <div class="ws-analytics-room-card__students">${room.students.map(n => escHtml(n)).join(', ') || '<em>No students</em>'}</div>
        <div class="ws-analytics-room-card__meta">
          <span>${room.totalWordCount.toLocaleString()} words</span>
          <span>${room.submissionCount} submissions</span>
          ${room.nudgeCount > 0 ? `<span>${room.nudgeCount} nudges</span>` : ''}
          <span>${room.roundsCompleted}/${room.totalRounds} rounds</span>
        </div>
        ${room.capabilityProfile?.summary ? `<div class="ws-analytics-room-card__profile">${escHtml(room.capabilityProfile.summary)}</div>` : ''}
      </div>`;
  }).join('');
}

function renderCapabilityHighlights(rooms, aiHighlights) {
  const section = $('analytics-capabilities-section');
  const container = $('analytics-capabilities');

  const roomsWithProfiles = rooms.filter(r => r.capabilityProfile?.capabilities?.length);
  if (roomsWithProfiles.length === 0 && (!aiHighlights || aiHighlights.length === 0)) {
    section.classList.add('ws-hidden');
    return;
  }
  section.classList.remove('ws-hidden');

  let html = '';
  if (aiHighlights?.length) {
    html += `<ul class="ws-analytics-list">${aiHighlights.map(h => `<li>${escHtml(h)}</li>`).join('')}</ul>`;
  }

  const allCaps = roomsWithProfiles.flatMap(r => (r.capabilityProfile.capabilities || []).map(c => c.capability));
  if (allCaps.length > 0) {
    html += `<div class="ws-capability-tags" style="margin-top:12px;">${allCaps.map(c => `<span class="ws-capability-tag">${escHtml(c)}</span>`).join('')}</div>`;
  }

  container.innerHTML = html;
}

function formatAnalyticsDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ============================================
   Real-time monitoring loop
   ============================================ */

function startMonitoring() {
  sessionStorage.setItem('ws_dash_sessionId', state.sessionId);
  showScreen('dashboard');

  // Initial full fetch to populate everything
  fullRefreshRooms();

  // Lightweight pulse every 2s — detects changes fast
  state.pulseInterval = setInterval(pollPulse, CFG.pulse_interval);

  // Full refresh fallback every 15s — catches anything pulse missed
  state.fullRefreshInterval = setInterval(fullRefreshRooms, CFG.full_refresh_interval);

  // Batch AI classification every 12s
  state.classifyInterval = setInterval(classifyDirtyRooms, CFG.classify_interval);

  // Inactivity check every 30s
  state.inactivityInterval = setInterval(checkInactivity, CFG.inactivity_check_interval);

  // Update relative times every second (elapsed timers, "Xs ago" labels)
  state.tickInterval = setInterval(tickTimers, 1000);
}

function stopMonitoring() {
  [state.pulseInterval, state.fullRefreshInterval, state.classifyInterval,
   state.inactivityInterval, state.tickInterval].forEach(id => {
    if (id) clearInterval(id);
  });
  state.pulseInterval = null;
  state.fullRefreshInterval = null;
  state.classifyInterval = null;
  state.inactivityInterval = null;
  state.tickInterval = null;
}

/* ============================================
   Pulse polling — lightweight change detection
   ============================================ */

async function pollPulse() {
  try {
    const data = await api('workshop-pulse', {
      params: { sessionId: state.sessionId },
    });
    const pulseRooms = data.rooms || [];
    const changedRoomIds = [];

    for (const p of pulseRooms) {
      const prev = state.lastPulse[p.id];
      const changed = !prev
        || prev.lastInputTime !== p.lastInputTime
        || prev.submissionCount !== p.submissionCount
        || prev.studentCount !== p.studentCount
        || prev.wordCount !== p.wordCount
        || prev.currentRound !== p.currentRound;

      if (changed) {
        changedRoomIds.push(p.id);
        state.dirtyRooms.add(p.id);
      }

      // Update pulse snapshot
      state.lastPulse[p.id] = p;
    }

    // Update live activity indicators from pulse data (no full fetch needed)
    updateFromPulse(pulseRooms);

    // Fetch full data only for rooms that actually changed
    if (changedRoomIds.length > 0) {
      await fetchChangedRooms(changedRoomIds);
    }

    // Update the live indicator
    updateLiveIndicator(true);
  } catch {
    updateLiveIndicator(false);
  }
}

/**
 * Update room cards with lightweight pulse data —
 * word counts, timestamps, student names — without waiting for full fetch.
 */
function updateFromPulse(pulseRooms) {
  for (const p of pulseRooms) {
    const card = document.querySelector(`[data-room-id="${p.id}"]`);
    if (!card) continue;

    // Update word count
    const wordEl = card.querySelector('[data-field="wordCount"]');
    if (wordEl) {
      const newText = `${p.wordCount} words`;
      if (wordEl.textContent !== newText) {
        wordEl.textContent = newText;
        flashElement(wordEl);
      }
    }

    // Update last input time
    const timeEl = card.querySelector('[data-field="lastInput"]');
    if (timeEl) {
      timeEl.textContent = relativeTime(p.lastInputTime);
      timeEl.dataset.ts = p.lastInputTime || '';
    }

    // Update elapsed timer
    const elapsedEl = card.querySelector('[data-field="elapsed"]');
    if (elapsedEl && p.roundStartTime) {
      elapsedEl.textContent = `${elapsedSince(p.roundStartTime)} elapsed`;
      elapsedEl.dataset.ts = p.roundStartTime;
    }

    // Show typing/active indicator if input was very recent
    const activeIndicator = card.querySelector('.ws-room-card__active');
    if (activeIndicator && p.lastInputTime) {
      const secsSinceInput = (Date.now() - new Date(p.lastInputTime).getTime()) / 1000;
      if (secsSinceInput < 8) {
        activeIndicator.classList.add('ws-room-card__active--visible');
      } else {
        activeIndicator.classList.remove('ws-room-card__active--visible');
      }
    }

    // Update student names if they changed (new join)
    const studentsEl = card.querySelector('.ws-room-card__students');
    if (studentsEl && p.studentCount !== (parseInt(card.dataset.studentCount, 10) || 0)) {
      card.dataset.studentCount = p.studentCount;
      if (p.studentCount > 0 && p.studentNames) {
        const idx = state.rooms.findIndex(r => String(r.id) === String(p.id));
        if (idx >= 0) {
          state.rooms[idx]._studentNames = p.studentNames;
          updateStudentsDisplay(studentsEl, state.rooms[idx]);
        }
      }
    }
  }
}

/**
 * Fetch full room data only for specific changed rooms.
 */
async function fetchChangedRooms(roomIds) {
  const fetches = roomIds.map(async (roomId) => {
    try {
      const data = await api('workshop-room', {
        params: { sessionId: state.sessionId, roomId },
      });
      const room = data.room || data;
      enrichRoom(room);

      // Upsert into state.rooms
      const idx = state.rooms.findIndex(r => String(r.id) === String(roomId));
      if (idx >= 0) {
        state.rooms[idx] = room;
      } else {
        state.rooms.push(room);
      }

      // Update just this card in the DOM
      updateRoomCard(room);
    } catch { /* silent */ }
  });

  await Promise.all(fetches);
  renderOverview();
}

/* ============================================
   Full refresh — fallback / initial load
   ============================================ */

async function fullRefreshRooms() {
  try {
    const data = await api('workshop-rooms', {
      params: { sessionId: state.sessionId },
    });
    const rooms = data.rooms || data || [];
    state.rooms = Array.isArray(rooms) ? rooms : [];

    state.rooms.forEach(enrichRoom);

    // Seed pulse cache
    state.rooms.forEach((room) => {
      state.lastPulse[room.id] = {
        id: room.id,
        studentCount: (room._studentNames || []).length,
        submissionCount: (room.submissions || []).length,
        wordCount: room._wordCount || 0,
        lastInputTime: room.lastInputTime || null,
        lastHeartbeat: room.lastHeartbeat || null,
        currentRound: room.currentRound || 1,
        roundStartTime: room.roundStartTime || null,
      };
    });

    state.lastFullRefresh = Date.now();
    renderOverview();
    renderRoomGrid();
  } catch { /* silent */ }
}

function enrichRoom(room) {
  const cls = getRoomStatus(room);
  room._status = cls.status;
  room._reasoning = cls.reasoning;
  room._suggestedNudge = cls.suggestedNudge;
  room._wordCount = getRoomWordCount(room);
  room._latestNotes = getLatestNotes(room);
  room._lastInputTime = getLastInputTime(room);
  room._studentNames = extractStudentNames(room.students);
}

/* ============================================
   Classification — batched for efficiency
   ============================================ */

async function classifyDirtyRooms() {
  const roomsToClassify = state.rooms.filter((room) => {
    if (!state.dirtyRooms.has(room.id)) return false;
    if (!room.submissions || room.submissions.length === 0) return false;
    const lastSubmission = room.lastInputTime;
    const lastClassified = state.lastClassifyTimestamps[room.id];
    return lastSubmission && lastSubmission !== lastClassified;
  });

  // Clear dirty set
  state.dirtyRooms.clear();

  for (const room of roomsToClassify) {
    try {
      const result = await api('workshop-classify', {
        body: { sessionId: state.sessionId, roomId: room.id },
      });
      const cls = result.classification || result;
      const newStatus = (cls.status || '').toLowerCase();
      const oldStatus = room._status;

      room._status = newStatus;
      room._reasoning = cls.reasoning || '';
      room._suggestedNudge = cls.suggestedNudge || null;
      state.lastClassifyTimestamps[room.id] = room.lastInputTime;

      // Update card with new status (with transition animation)
      const card = document.querySelector(`[data-room-id="${room.id}"]`);
      if (card && newStatus !== oldStatus) {
        updateStatusBadge(card, room);
        card.classList.add('ws-room-card--status-change');
        setTimeout(() => card.classList.remove('ws-room-card--status-change'), 1500);
      }
    } catch { /* silent */ }
  }

  renderOverview();
}

async function checkInactivity() {
  try {
    await api('workshop-classify-inactive', {
      params: { sessionId: state.sessionId },
    });
  } catch { /* silent */ }
}

/* ============================================
   Timer ticks — update relative times every second
   ============================================ */

function tickTimers() {
  // Update all "Xs ago" labels
  document.querySelectorAll('[data-field="lastInput"]').forEach((el) => {
    const ts = el.dataset.ts;
    if (ts) el.textContent = relativeTime(ts);
  });

  // Update all elapsed timers
  document.querySelectorAll('[data-field="elapsed"]').forEach((el) => {
    const ts = el.dataset.ts;
    if (ts) el.textContent = `${elapsedSince(ts)} elapsed`;
  });

  // Update active/typing indicators
  document.querySelectorAll('.ws-room-card__active').forEach((el) => {
    const card = el.closest('[data-room-id]');
    if (!card) return;
    const roomId = card.dataset.roomId;
    const pulse = state.lastPulse[roomId];
    if (pulse && pulse.lastInputTime) {
      const secs = (Date.now() - new Date(pulse.lastInputTime).getTime()) / 1000;
      if (secs < 8) {
        el.classList.add('ws-room-card__active--visible');
      } else {
        el.classList.remove('ws-room-card__active--visible');
      }
    }
  });
}

/* ============================================
   Live indicator
   ============================================ */

function updateLiveIndicator(connected) {
  const el = $('live-indicator');
  if (!el) return;
  if (connected) {
    el.className = 'ws-live-indicator ws-live-indicator--connected';
    el.textContent = 'LIVE';
  } else {
    el.className = 'ws-live-indicator ws-live-indicator--disconnected';
    el.textContent = 'RECONNECTING';
  }
}

/* ============================================
   Room data helpers
   ============================================ */

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
    else dot.style.background = 'var(--ci-grey-dot)';
    strip.appendChild(dot);
  });
}

/* ============================================
   Room cards — DOM diffing
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

/**
 * Full grid render — used on initial load and full refresh.
 * Creates cards with data-room-id for subsequent in-place updates.
 */
function renderRoomGrid() {
  const grid = $('room-grid');
  grid.innerHTML = '';
  const sorted = sortRooms(state.rooms);
  sorted.forEach((room) => {
    grid.appendChild(createRoomCard(room));
  });
}

/**
 * Update a single room card in-place (DOM diffing).
 * Falls back to replace if card doesn't exist.
 */
function updateRoomCard(room) {
  const existing = document.querySelector(`[data-room-id="${room.id}"]`);
  if (!existing) {
    // Card doesn't exist yet — append it
    const grid = $('room-grid');
    if (grid) {
      grid.appendChild(createRoomCard(room));
    }
    return;
  }

  // Update fields in-place
  updateStatusBadge(existing, room);
  updateStudentsDisplay(existing.querySelector('.ws-room-card__students'), room);

  // Meta fields
  const roundEl = existing.querySelector('[data-field="round"]');
  const r = room.currentRound || 1;
  if (roundEl) roundEl.textContent = `Q${Math.ceil(r / 2)} · Turn ${((r - 1) % 2) + 1}`;

  const wordEl = existing.querySelector('[data-field="wordCount"]');
  if (wordEl) {
    const newWc = `${room._wordCount || 0} words`;
    if (wordEl.textContent !== newWc) {
      wordEl.textContent = newWc;
      flashElement(wordEl);
    }
  }

  const timeEl = existing.querySelector('[data-field="lastInput"]');
  if (timeEl) {
    timeEl.textContent = relativeTime(room._lastInputTime);
    timeEl.dataset.ts = room._lastInputTime || '';
  }

  const elapsedEl = existing.querySelector('[data-field="elapsed"]');
  if (elapsedEl) {
    if (room.roundStartTime) {
      elapsedEl.textContent = `${elapsedSince(room.roundStartTime)} elapsed`;
      elapsedEl.dataset.ts = room.roundStartTime;
    }
  }

  // Preview
  const previewEl = existing.querySelector('.ws-room-card__preview');
  const preview = room._latestNotes || '';
  if (previewEl) {
    const oldPreview = previewEl.dataset.full || '';
    if (preview !== oldPreview) {
      previewEl.dataset.full = preview;
      if (previewEl.classList.contains('ws-room-card__preview--collapsed')) {
        previewEl.textContent = preview.slice(0, 150) + (preview.length > 150 ? '...' : '');
      } else {
        previewEl.textContent = preview;
      }
      flashElement(previewEl);
    }
  } else if (preview) {
    const actionsEl = existing.querySelector('.ws-room-card__actions');
    if (actionsEl) {
      const newPreview = document.createElement('div');
      newPreview.className = 'ws-room-card__preview ws-room-card__preview--collapsed';
      newPreview.dataset.full = preview;
      newPreview.textContent = preview.slice(0, 150) + (preview.length > 150 ? '...' : '');
      newPreview.addEventListener('click', togglePreview);
      actionsEl.parentNode.insertBefore(newPreview, actionsEl);
      flashElement(newPreview);
    }
  }

  // Reasoning
  const reasoningEl = existing.querySelector('.ws-room-card__reasoning');
  if (reasoningEl && room._reasoning) {
    reasoningEl.textContent = room._reasoning;
  } else if (!reasoningEl && room._reasoning) {
    const actionsEl = existing.querySelector('.ws-room-card__actions');
    if (actionsEl) {
      const newReasoning = document.createElement('div');
      newReasoning.className = 'ws-room-card__reasoning';
      newReasoning.textContent = room._reasoning;
      actionsEl.parentNode.insertBefore(newReasoning, actionsEl);
    }
  }

  // Flash the card to indicate update
  existing.classList.add('ws-room-card--updated');
  setTimeout(() => existing.classList.remove('ws-room-card--updated'), 1500);
}

function updateStatusBadge(card, room) {
  const statusEl = card.querySelector('.ws-room-card__status');
  if (!statusEl) return;

  const status = room._status || '';
  const statusLabel = status || 'pending';
  const statusClass = status === 'red' ? '--red' : status === 'yellow' ? '--yellow' : status === 'green' ? '--green' : '--grey';

  statusEl.className = `ws-room-card__status ws-room-card__status${statusClass}`;
  statusEl.innerHTML = `<span class="ws-room-card__status-dot"></span>${statusLabel}`;
}

function updateStudentsDisplay(el, room) {
  if (!el) return;
  const studentNames = room._studentNames || [];
  const round = room.currentRound || 1;

  let interviewerName = '';
  let storytellerName = '';
  if (studentNames.length >= 2) {
    const sortedNames = [...studentNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const r = typeof round === 'number' ? round : 1;
    interviewerName = r % 2 === 1 ? sortedNames[0] : sortedNames[1];
    storytellerName = r % 2 === 1 ? sortedNames[1] : sortedNames[0];
  }

  if (studentNames.length === 0) {
    el.innerHTML = '<em style="color:var(--ci-text-muted);">No students yet</em>';
  } else if (interviewerName) {
    el.innerHTML = `<strong>${escHtml(interviewerName)}</strong> interviewing <strong>${escHtml(storytellerName)}</strong>`;
  } else {
    el.innerHTML = studentNames.map((n) => `<strong>${escHtml(n)}</strong>`).join(', ');
  }
}

function togglePreview(e) {
  const previewEl = e.currentTarget;
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
}

function flashElement(el) {
  el.classList.add('ws-flash');
  setTimeout(() => el.classList.remove('ws-flash'), 800);
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

  let interviewerName = '';
  let storytellerName = '';
  if (studentNames.length >= 2) {
    const sortedNames = [...studentNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const r = typeof round === 'number' ? round : 1;
    interviewerName = r % 2 === 1 ? sortedNames[0] : sortedNames[1];
    storytellerName = r % 2 === 1 ? sortedNames[1] : sortedNames[0];
  }

  const card = document.createElement('div');
  card.className = 'ws-room-card';
  card.dataset.roomId = roomId;
  card.dataset.studentCount = studentNames.length;

  const statusClass = status === 'red' ? '--red' : status === 'yellow' ? '--yellow' : status === 'green' ? '--green' : '--grey';

  card.innerHTML = `
    <div class="ws-room-card__top">
      <div class="ws-room-card__id">
        Room ${roomId}
        <span class="ws-room-card__active" title="Student is actively typing"></span>
      </div>
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
      <span class="ws-room-card__meta-item" data-field="round">Q${Math.ceil(round / 2)} · Turn ${((round - 1) % 2) + 1}</span>
      ${roundStartedAt ? `<span class="ws-room-card__meta-item" data-field="elapsed" data-ts="${roundStartedAt}">${elapsedSince(roundStartedAt)} elapsed</span>` : '<span class="ws-room-card__meta-item" data-field="elapsed"></span>'}
      <span class="ws-room-card__meta-item" data-field="wordCount">${wordCount} words</span>
      <span class="ws-room-card__meta-item" data-field="lastInput" data-ts="${lastInput || ''}">${relativeTime(lastInput)}</span>
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
    previewEl.addEventListener('click', togglePreview);
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
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  document.querySelectorAll('.ws-nudge-suggestion').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      $('nudge-custom').value = NUDGE_SUGGESTIONS[idx];
      document.querySelectorAll('.ws-nudge-suggestion').forEach((b) => b.classList.remove('ws-nudge-suggestion--selected'));
      btn.classList.add('ws-nudge-suggestion--selected');
    });
  });

  $('btn-nudge-cancel').addEventListener('click', closeNudgeModal);
  $('btn-nudge-send').addEventListener('click', handleSendNudge);

  $('nudge-modal').addEventListener('click', (e) => {
    if (e.target === $('nudge-modal')) closeNudgeModal();
  });
}

function openNudgeModal(roomId) {
  state.nudgeTargetRoomId = roomId;

  // Pre-fill with AI-suggested nudge if available
  const room = state.rooms.find(r => String(r.id) === String(roomId));
  const suggested = room?._suggestedNudge;

  $('nudge-modal-target').textContent = `To Room ${roomId}`;
  $('nudge-custom').value = suggested || '';
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

function tryResume() {
  const wasAuth = sessionStorage.getItem('ws_dash_auth') === 'true';
  const savedSession = sessionStorage.getItem('ws_dash_sessionId');

  if (wasAuth && savedSession) {
    state.authenticated = true;
    state.sessionId = savedSession;
    showSessionSubtitle(state.sessionId);
    startMonitoring();
  } else if (wasAuth) {
    state.authenticated = true;
    showScreen('session');
    loadSessions();
  }
}

function init() {
  initTheme();
  initLogin();
  initSession();
  initNudgeModal();

  $('btn-back-sessions').addEventListener('click', () => {
    stopMonitoring();
    state.sessionId = '';
    state.rooms = [];
    state.lastPulse = {};
    state.dirtyRooms.clear();
    sessionStorage.removeItem('ws_dash_sessionId');
    $('dash-subtitle').textContent = 'Facilitator view';
    loadSessions();
    showScreen('session');
  });

  $('btn-download-json').addEventListener('click', () => {
    if (state.sessionId) downloadSessionJSON(state.sessionId, '');
  });

  $('btn-back-from-analytics').addEventListener('click', () => {
    showScreen('session');
    loadSessions();
  });

  $('btn-analytics-download').addEventListener('click', () => {
    if (!analyticsSessionId || !analyticsCache[analyticsSessionId]) return;
    const blob = new Blob([JSON.stringify(analyticsCache[analyticsSessionId], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${analyticsSessionId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  tryResume();
}

init();
