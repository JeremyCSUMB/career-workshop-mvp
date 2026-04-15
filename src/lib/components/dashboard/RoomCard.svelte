<script>
	let { room, totalRounds = 0, onNudge, onMoveStudent } = $props();

	let roomId = $derived(room.id || '?');
	let studentNames = $derived(room._studentNames || []);
	let students = $derived(room._students || {});
	let presence = $derived(room._presence || null);
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

	let interviewerName = $derived.by(() => {
		if (studentNames.length < 2) return '';
		const sorted = [...studentNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
		return round % 2 === 1 ? sorted[0] : sorted[1];
	});

	let storytellerName = $derived.by(() => {
		if (studentNames.length < 2) return '';
		const sorted = [...studentNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
		return round % 2 === 1 ? sorted[1] : sorted[0];
	});

	let statusClass = $derived(
		status === 'red' ? 'ws-room-card__status--red' :
		status === 'yellow' ? 'ws-room-card__status--yellow' :
		status === 'green' ? 'ws-room-card__status--green' :
		'ws-room-card__status--grey'
	);

	let isComplete = $derived(totalRounds > 0 && round > totalRounds);
	let questionNum = $derived(Math.ceil(round / 2));
	let turnNum = $derived(((round - 1) % 2) + 1);
	let totalQuestions = $derived(Math.ceil(totalRounds / 2));

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
		if (students.student1 === name) return presence.student1;
		if (students.student2 === name) return presence.student2;
		return null;
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
		const p1 = getPresenceForStudent(studentNames[0]);
		const p2 = getPresenceForStudent(studentNames[1]);
		if (!p1 || !p2) return null;
		const TWO_MIN = 2 * 60 * 1000;
		const now = Date.now();
		const s1Offline = !p1.online && p1.lastSeen && (now - new Date(p1.lastSeen).getTime() > TWO_MIN);
		const s2Offline = !p2.online && p2.lastSeen && (now - new Date(p2.lastSeen).getTime() > TWO_MIN);
		// Show button for the online student when partner is offline >2min
		if (s1Offline && p2.online) return studentNames[1];
		if (s2Offline && p1.online) return studentNames[0];
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
		{:else if interviewerName}
			{@const pInt = getPresenceForStudent(interviewerName)}
			{@const pSt = getPresenceForStudent(storytellerName)}
			<span class="ws-room-card__student-presence">
				{#if pInt}<span class="ws-room-card__presence-dot {pInt.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
				<strong>{interviewerName}</strong>
				{#if pInt && !pInt.online && pInt.lastSeen}
					<span class="ws-room-card__offline-since">offline since {formatOfflineSince(pInt.lastSeen)}</span>
				{/if}
			</span>
			{' '}interviewing{' '}
			<span class="ws-room-card__student-presence">
				{#if pSt}<span class="ws-room-card__presence-dot {pSt.online ? 'ws-room-card__presence-dot--online' : 'ws-room-card__presence-dot--offline'}"></span>{/if}
				<strong>{storytellerName}</strong>
				{#if pSt && !pSt.online && pSt.lastSeen}
					<span class="ws-room-card__offline-since">offline since {formatOfflineSince(pSt.lastSeen)}</span>
				{/if}
			</span>
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
