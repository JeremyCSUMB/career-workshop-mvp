<script>
	import { untrack } from 'svelte';
	import { api } from '$lib/api.js';
	import { interviewState } from '$lib/stores/interview.js';

	let { onRoomsFound, codeFromUrl = false, googleName = '' } = $props();

	let loading = $state(false);
	let error = $state('');
	let sessionInput = $state('');
	let nameInput = $state(googleName);

	// Only autofill the session code when it comes from a ?code= URL parameter
	$effect(() => {
		if (codeFromUrl) {
			sessionInput = untrack(() => $interviewState.sessionId);
		}
	});

	async function handleFindRooms() {
		const sessionId = sessionInput.trim();
		const studentName = nameInput.trim();
		error = '';

		if (!sessionId || sessionId.length < 4) {
			error = 'Please enter a valid session code.';
			return;
		}
		if (!studentName || studentName.length < 2) {
			error = 'Please enter your name.';
			return;
		}

		loading = true;
		try {
			const data = await api('workshop-rooms', { params: { sessionId } });
			if (data.ended) {
				error = 'This session has ended. You can no longer join.';
				return;
			}
			const rooms = data.rooms || [];
			if (rooms.length === 0) {
				error = 'No rooms found for that session code.';
				return;
			}

			interviewState.update((s) => ({
				...s,
				sessionId,
				studentName,
				totalRounds: data.rounds || s.totalRounds,
				prompts: data.prompts || s.prompts
			}));
			onRoomsFound(rooms);
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Enter') handleFindRooms();
	}
</script>

<div class="ws-card">
	<h2>Join a Workshop</h2>
	{#if googleName}
		<p>Welcome, {googleName}! Enter the session code from your facilitator.</p>
	{:else}
		<p>Enter the session code from your facilitator and your name.</p>
	{/if}
	<div class="ws-field">
		<label class="ws-label" for="entry-session">Session Code</label>
		<input
			id="entry-session"
			class="ws-input"
			type="text"
			maxlength="10"
			placeholder="e.g. a1b2c3"
			autocomplete="off"
			bind:value={sessionInput}
			disabled={codeFromUrl}
			style:opacity={codeFromUrl ? '0.7' : '1'}
			style:cursor={codeFromUrl ? 'not-allowed' : 'text'}
			onkeydown={handleKeydown}
		>
	</div>
	{#if !googleName}
	<div class="ws-field">
		<label class="ws-label" for="entry-name">Your Name</label>
		<input
			id="entry-name"
			class="ws-input"
			type="text"
			placeholder="First and last name"
			autocomplete="name"
			bind:value={nameInput}
			onkeydown={handleKeydown}
		>
	</div>
	{/if}
	{#if error}
		<div class="ws-error">{error}</div>
	{/if}
	<div class="ws-btn-row">
		<button class="ws-btn" onclick={handleFindRooms} disabled={loading}>
			{loading ? 'Loading...' : 'Find Rooms'}
		</button>
	</div>
</div>
