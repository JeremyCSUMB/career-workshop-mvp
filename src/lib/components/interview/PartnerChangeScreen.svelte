<script>
	import { api } from '$lib/api.js';
	import { WORKSHOP_CONFIG as CFG } from '$lib/config.js';
	import { interviewState } from '$lib/stores/interview.js';
	import { onDestroy } from 'svelte';

	let { onReady } = $props();

	let myReady = $state(false);
	let partnerReady = $state(false);
	let elapsedTimeout = $state(false);
	let pollInterval = null;
	let timeoutTimer = null;

	// Derived from store
	let round = $derived($interviewState.round);
	let students = $derived($interviewState.students);
	let studentName = $derived($interviewState.studentName);
	let partnerName = $derived(() => {
		const names = students.filter((n) => n !== studentName);
		return names.length > 0 ? names[0] : '';
	});

	// Auto-transition after 10 seconds regardless of ready state
	timeoutTimer = setTimeout(() => {
		elapsedTimeout = true;
		transition();
	}, 10000);

	async function handleReady() {
		myReady = true;
		// Write ready flag via heartbeat
		try {
			await api('workshop-heartbeat', {
				body: {
					sessionId: $interviewState.sessionId,
					roomId: $interviewState.roomId,
					studentName,
					readyForRound: round
				}
			});
		} catch {}

		// Check if partner is already ready
		if (partnerReady) {
			transition();
		}
	}

	// Poll for partner's ready status
	function startPoll() {
		const poll = async () => {
			try {
				const data = await api('workshop-room', {
					params: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId }
				});
				const room = data.room || data;
				const presence = room.presence || {};

				// Find partner's slot
				let partnerSlot = null;
				if (room.students) {
					if (room.students.student1 === studentName) partnerSlot = 'student2';
					else if (room.students.student2 === studentName) partnerSlot = 'student1';
				}

				if (partnerSlot && presence[partnerSlot] && presence[partnerSlot].readyForRound === round) {
					partnerReady = true;
					if (myReady) {
						transition();
					}
				}
			} catch {}
		};
		poll();
		pollInterval = setInterval(poll, 2000);
	}

	startPoll();

	function transition() {
		if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
		if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
		onReady();
	}

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
		if (timeoutTimer) clearTimeout(timeoutTimer);
	});
</script>

<div class="ws-card" style="text-align:center;padding:40px 24px;">
	<div style="font-size:48px;margin-bottom:16px;">&#129309;</div>
	<h2 style="margin:0 0 12px;">New Partner</h2>
	<p style="color:var(--ci-text);margin:0 0 8px;">
		You've been paired with a new partner! You'll be starting Round {round} together.
	</p>
	{#if partnerName()}
		<p style="font-size:18px;font-weight:600;color:var(--ci-accent);margin:0 0 24px;">
			{partnerName()}
		</p>
	{/if}

	{#if !myReady}
		<button class="ws-btn" onclick={handleReady}>Ready</button>
	{:else if !partnerReady && !elapsedTimeout}
		<p style="color:var(--ci-text-muted);margin:0;">Waiting for your partner to be ready...</p>
	{/if}
</div>
