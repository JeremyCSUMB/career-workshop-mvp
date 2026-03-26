<script>
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api.js';

	let { sessionId, sessionName = '', onClose } = $props();

	let joinUrl = $state('');
	let studentCount = $state(0);
	let roomCount = $state(0);
	let filledRooms = $state(0);
	let pollInterval = null;
	let copied = $state(false);

	function getJoinLink() {
		const base = typeof window !== 'undefined' ? window.location.origin : '';
		return `${base}/interview?code=${encodeURIComponent(sessionId)}`;
	}

	let formattedCode = $derived(sessionId);

	async function pollStudents() {
		try {
			const data = await api('workshop-pulse', { params: { sessionId } });
			const rooms = data.rooms || [];
			roomCount = rooms.length;
			studentCount = rooms.reduce((sum, r) => sum + (r.studentCount || 0), 0);
			filledRooms = rooms.filter(r => (r.studentCount || 0) >= 2).length;
		} catch {}
	}

	function copyLink() {
		navigator.clipboard.writeText(joinUrl).then(() => {
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		});
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') onClose();
	}

	onMount(() => {
		joinUrl = getJoinLink();
		pollStudents();
		pollInterval = setInterval(pollStudents, 3000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="ws-projector">
	<div class="ws-projector__backdrop"></div>

	<div class="ws-projector__content">
		<!-- Close button -->
		<button class="ws-projector__close" onclick={onClose} aria-label="Close projector view">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>

		<!-- Join URL -->
		<div class="ws-projector__url">
			{joinUrl.replace(/^https?:\/\//, '')}
		</div>

		<!-- Session code (huge) -->
		<div class="ws-projector__code">
			{formattedCode}
		</div>

		<!-- Session name -->
		{#if sessionName}
			<div class="ws-projector__name">{sessionName}</div>
		{/if}

		<!-- Status -->
		<div class="ws-projector__status">
			{#if studentCount === 0}
				<span class="ws-projector__status-dot ws-projector__status-dot--waiting"></span>
				Waiting for students to join...
			{:else}
				<span class="ws-projector__status-dot ws-projector__status-dot--active"></span>
				<strong>{studentCount}</strong> student{studentCount !== 1 ? 's' : ''} joined
				&middot; {filledRooms} of {roomCount} rooms paired
			{/if}
		</div>

		<!-- Action buttons -->
		<div class="ws-projector__actions">
			<button class="ws-projector__btn" onclick={copyLink}>
				{copied ? 'Copied!' : 'Copy Join Link'}
			</button>
			<button class="ws-projector__btn ws-projector__btn--secondary" onclick={onClose}>
				Open Dashboard
			</button>
		</div>
	</div>
</div>
