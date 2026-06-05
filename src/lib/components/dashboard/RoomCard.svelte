<script>
	import { findStudentSlot, rolesForRound, turnForRound, questionForRound } from '$lib/rooms.js';

	let { room, totalRounds = 0, onNudge, onMoveStudent } = $props();

	let roomId = $derived(room.id || '?');
	let studentNames = $derived(room._studentNames || []);
	let students = $derived(room._students || {});
	let presence = $derived(room._presence || null);
	let roomSize = $derived(room.roomSize || 2);
	let status = $derived(room._status || '');
	let statusLabel = $derived(status || 'pending');
	let round = $derived(room.currentRound || 1);
	let wordCount = $derived(room._wordCount || 0);
	let lastInput = $derived(room._lastInputTime);
	let preview = $derived(room._latestNotes || '');
	let submissionSummaries = $derived(room._submissionSummaries || []);
	let phase = $derived(room._phase || '');
	let reasoning = $derived(room._reasoning || '');
	let roundStartedAt = $derived(room.roundStartTime);

	let roundRoles = $derived.by(() => rolesForRound(students, round, roomSize));

	let statusClass = $derived(
		status === 'red' ? 'ws-room-card__status--red' :
		status === 'yellow' ? 'ws-room-card__status--yellow' :
		status === 'green' ? 'ws-room-card__status--green' :
		'ws-room-card__status--grey'
	);

	let isComplete = $derived(totalRounds > 0 && round > totalRounds);
	let questionNum = $derived(questionForRound(round, roomSize));
	let turnNum = $derived(turnForRound(round, roomSize));
	let totalQuestions = $derived(questionForRound(totalRounds, roomSize));

	let isActive = $derived.by(() => {
		if (!lastInput) return false;
		const secs = (Date.now() - new Date(lastInput).getTime()) / 1000;
		return secs < 8;
	});

	let previewCollapsed = $state(true);

	function togglePreview() {
		previewCollapsed = !previewCollapsed;
	}

	function relativeTime(isoOrMs) {
		if (!isoOrMs) return '\u2014';
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

	// Presence helpers
	function getPresenceForStudent(name) {
		if (!presence || !name) return null;
		// Map student name to slot
		const slot = findStudentSlot(students, name, roomSize);
		return slot ? presence[slot] : null;
	}

	function formatOfflineSince(lastSeen) {
		if (!lastSeen) return '';
		const d = new Date(lastSeen);
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	// Tick for live updates
	let tick = $state(0);
	let tickInterval;

	import { onMount, onDestroy } from 'svelte';
	onMount(() => { tickInterval = setInterval(() => { tick++; }, 1000); });
	onDestroy(() => { if (tickInterval) clearInterval(tickInterval); });

	// Move student eligibility: one student online, the other offline >2 minutes
	let moveEligibleStudent = $derived.by(() => {
		tick; // re-evaluate each second
		if (!presence || studentNames.length < 2) return null;
		const TWO_MIN = 2 * 60 * 1000;
		const now = Date.now();
		const onlineNames = [];
		const offlineLong = [];
		for (const name of studentNames) {
			const p = getPresenceForStudent(name);
			if (!p) continue;
			if (p.online) onlineNames.push(name);
			else if (p.lastSeen && (now - new Date(p.lastSeen).getTime() > TWO_MIN)) offlineLong.push(name);
		}
		if (offlineLong.length > 0 && onlineNames.length === 1) return onlineNames[0];
		return null;
	});

	// Force re-derive on tick
	let relTime = $derived.by(() => { tick; return relativeTime(lastInput); });
	let elapsed = $derived.by(() => { tick; return roundStartedAt ? `${elapsedSince(roundStartedAt)} elapsed` : ''; });
	let activeNow = $derived.by(() => {
		tick;
		if (!lastInput) return false;
		return (Date.now() - new Date(lastInput).getTime()) / 1000 < 8;
	});
</script>

<div class="ws-room-card" data-room-id={roomId}>
	<div class="ws-room-card__top">
		<div class="ws-room-card__id">
			Room {roomId}
			{#if activeNow}
				<span class="ws-room-card__typing" title="Student is actively typing">
					<span class="ws-room-card__typing-dot"></span>
					<span class="ws-room-card__typing-dot"></span>
					<span class="ws-room-card__typing-dot"></span>
				</span>
			{/if}
		</div>
		<div class="ws-room-card__status {statusClass}">
			<span class="ws-room-card__status-dot"></span>
			{statusLabel}
		</div>
	</div>
	<div class="ws-room-card__students">
		{#if studentNames.length === 0}
			<em style="color:var(--ci-text-muted);">No students yet</em>
		{:else if isComplete}
			{#each studentNames as name}
				{@const p = getPresenceForStudent(name)}
				<span class="ws-room-card__student-presence">
					{#if p}<span class="ws-room-card__presence-dot {p.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
					<strong>{name}</strong>
					{#if p && !p.online && p.lastSeen}
						<span class="ws-room-card__offline-since">offline since {formatOfflineSince(p.lastSeen)}</span>
					{/if}
				</span>
			{/each}
		{:else if roundRoles}
			{#if roomSize === 2}
				{@const pInt = getPresenceForStudent(roundRoles.asker)}
				{@const pSt = getPresenceForStudent(roundRoles.answerer)}
				<span class="ws-room-card__student-presence">
					{#if pInt}<span class="ws-room-card__presence-dot {pInt.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
					<strong>{roundRoles.asker}</strong>
					{#if pInt && !pInt.online && pInt.lastSeen}
						<span class="ws-room-card__offline-since">offline since {formatOfflineSince(pInt.lastSeen)}</span>
					{/if}
				</span>
				{' '}interviewing{' '}
				<span class="ws-room-card__student-presence">
					{#if pSt}<span class="ws-room-card__presence-dot {pSt.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
					<strong>{roundRoles.answerer}</strong>
					{#if pSt && !pSt.online && pSt.lastSeen}
						<span class="ws-room-card__offline-since">offline since {formatOfflineSince(pSt.lastSeen)}</span>
					{/if}
				</span>
			{:else}
				{@const pAsk = getPresenceForStudent(roundRoles.asker)}
				{@const pAns = getPresenceForStudent(roundRoles.answerer)}
				{@const pNote = getPresenceForStudent(roundRoles.noteTaker)}
				<span class="ws-room-card__student-presence">
					{#if pAsk}<span class="ws-room-card__presence-dot {pAsk.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
					<strong>{roundRoles.asker}</strong> asks
				</span>
				{' · '}
				<span class="ws-room-card__student-presence">
					{#if pAns}<span class="ws-room-card__presence-dot {pAns.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
					<strong>{roundRoles.answerer}</strong> answers
				</span>
				{' · '}
				<span class="ws-room-card__student-presence">
					{#if pNote}<span class="ws-room-card__presence-dot {pNote.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
					<strong>{roundRoles.noteTaker}</strong> notes
				</span>
			{/if}
		{:else}
			{#each studentNames as name}
				{@const p = getPresenceForStudent(name)}
				<span class="ws-room-card__student-presence">
					{#if p}<span class="ws-room-card__presence-dot {p.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
					<strong>{name}</strong>
					{#if p && !p.online && p.lastSeen}
						<span class="ws-room-card__offline-since">offline since {formatOfflineSince(p.lastSeen)}</span>
					{/if}
				</span>
			{/each}
		{/if}
	</div>
	<div class="ws-room-card__meta">
		<span class="ws-room-card__meta-item">{isComplete ? `Complete (${totalQuestions} Q)` : `Q${questionNum} · Turn ${turnNum}`}</span>
		{#if phase && !isComplete}
			<span class="ws-room-card__phase ws-room-card__phase--{phase}">{phase === 'follow-up' ? 'Follow-up Qs' : phase === 'profile' ? 'Profile' : phase === 'notes' ? 'Taking notes' : 'Waiting'}</span>
		{/if}
		{#if elapsed}
			<span class="ws-room-card__meta-item">{elapsed}</span>
		{/if}
		<span class="ws-room-card__meta-item">{wordCount} words</span>
		<span class="ws-room-card__meta-item">{relTime}</span>
	</div>
	{#if submissionSummaries.length > 0}
		<button
			class="ws-room-card__preview"
			class:ws-room-card__preview--collapsed={previewCollapsed}
			class:ws-room-card__preview--expanded={!previewCollapsed}
			onclick={togglePreview}
			aria-label={previewCollapsed ? 'Expand preview' : 'Collapse preview'}
		>
			{#if previewCollapsed}
				{@const last = submissionSummaries[submissionSummaries.length - 1]}
				<span class="ws-room-card__submission-label">{last.label} ({last.wordCount}w)</span>
				{last.notes.length > 120 ? last.notes.slice(0, 120) + '...' : last.notes}
			{:else}
				{#each submissionSummaries as sub}
					<div class="ws-room-card__submission">
						<span class="ws-room-card__submission-label">{sub.label} ({sub.wordCount}w)</span>
						{sub.notes}
					</div>
				{/each}
			{/if}
		</button>
	{:else if preview}
		<button
			class="ws-room-card__preview"
			class:ws-room-card__preview--collapsed={previewCollapsed}
			class:ws-room-card__preview--expanded={!previewCollapsed}
			onclick={togglePreview}
			aria-label={previewCollapsed ? 'Expand preview' : 'Collapse preview'}
		>
			{previewCollapsed ? (preview.length > 150 ? preview.slice(0, 150) + '...' : preview) : preview}
		</button>
	{/if}
	{#if reasoning}
		<div class="ws-room-card__reasoning">{reasoning}</div>
	{/if}
	<div class="ws-room-card__actions">
		<button class="ws-btn ws-btn--small ws-btn--secondary" onclick={() => onNudge(roomId)}>Send Nudge</button>
		{#if moveEligibleStudent}
			<button class="ws-btn ws-btn--small ws-btn--secondary" onclick={() => onMoveStudent(roomId, moveEligibleStudent)}>Move Student</button>
		{/if}
	</div>
</div>
