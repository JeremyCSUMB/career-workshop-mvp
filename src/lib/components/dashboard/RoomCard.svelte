<script>
	let { room, onNudge } = $props();

	let roomId = $derived(room.id || '?');
	let studentNames = $derived(room._studentNames || []);
	let status = $derived(room._status || '');
	let statusLabel = $derived(status || 'pending');
	let round = $derived(room.currentRound || 1);
	let wordCount = $derived(room._wordCount || 0);
	let lastInput = $derived(room._lastInputTime);
	let preview = $derived(room._latestNotes || '');
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

	let questionNum = $derived(Math.ceil(round / 2));
	let turnNum = $derived(((round - 1) % 2) + 1);

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

	// Tick for live updates
	let tick = $state(0);
	let tickInterval;

	import { onMount, onDestroy } from 'svelte';
	onMount(() => { tickInterval = setInterval(() => { tick++; }, 1000); });
	onDestroy(() => { if (tickInterval) clearInterval(tickInterval); });

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
			<span class="ws-room-card__active" class:ws-room-card__active--visible={activeNow} title="Student is actively typing"></span>
		</div>
		<div class="ws-room-card__status {statusClass}">
			<span class="ws-room-card__status-dot"></span>
			{statusLabel}
		</div>
	</div>
	<div class="ws-room-card__students">
		{#if studentNames.length === 0}
			<em style="color:var(--ci-text-muted);">No students yet</em>
		{:else if interviewerName}
			<strong>{interviewerName}</strong> interviewing <strong>{storytellerName}</strong>
		{:else}
			{#each studentNames as name}
				<strong>{name}</strong>{' '}
			{/each}
		{/if}
	</div>
	<div class="ws-room-card__meta">
		<span class="ws-room-card__meta-item">Q{questionNum} · Turn {turnNum}</span>
		{#if elapsed}
			<span class="ws-room-card__meta-item">{elapsed}</span>
		{/if}
		<span class="ws-room-card__meta-item">{wordCount} words</span>
		<span class="ws-room-card__meta-item">{relTime}</span>
	</div>
	{#if preview}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="ws-room-card__preview"
			class:ws-room-card__preview--collapsed={previewCollapsed}
			class:ws-room-card__preview--expanded={!previewCollapsed}
			onclick={togglePreview}
		>
			{previewCollapsed ? (preview.length > 150 ? preview.slice(0, 150) + '...' : preview) : preview}
		</div>
	{/if}
	{#if reasoning}
		<div class="ws-room-card__reasoning">{reasoning}</div>
	{/if}
	<div class="ws-room-card__actions">
		<button class="ws-btn ws-btn--small ws-btn--secondary" onclick={() => onNudge(roomId)}>Send Nudge</button>
	</div>
</div>
