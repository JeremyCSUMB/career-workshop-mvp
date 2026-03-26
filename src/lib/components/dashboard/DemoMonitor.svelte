<script>
	import OverviewBar from './OverviewBar.svelte';
	import RoomCard from './RoomCard.svelte';
	import NudgeModal from './NudgeModal.svelte';
	import { MOCK_ROOMS, MOCK_TOTAL_ROUNDS } from './guideData.js';

	let rooms = $state([...MOCK_ROOMS]);
	let totalRounds = MOCK_TOTAL_ROUNDS;

	// Demo nudge modal state (no API call)
	let nudgeVisible = $state(false);
	let nudgeRoomId = $state('');
	let nudgeSuggested = $state('');

	function openNudge(roomId) {
		const room = rooms.find(r => String(r.id) === String(roomId));
		nudgeSuggested = room?._suggestedNudge || '';
		nudgeRoomId = roomId;
		nudgeVisible = true;
	}

	function closeNudge() {
		nudgeVisible = false;
		nudgeRoomId = '';
	}

	// Annotations explaining key UI elements
	const annotations = [
		{ id: 1, label: 'Overview Bar', description: 'Shows room count and status breakdown at a glance. Dots represent each room\'s current status.' },
		{ id: 2, label: 'Status Colors', description: 'Green = strong engagement, Yellow = surface-level, Red = needs attention. Rooms are sorted with red first.' },
		{ id: 3, label: 'Room Details', description: 'Each card shows student names, current question/turn, word count, and time since last input.' },
		{ id: 4, label: 'AI Reasoning', description: 'The system explains why a room got its status — so you know exactly what\'s happening.' },
		{ id: 5, label: 'Send Nudge', description: 'Click to send a prompt directly to a room. Students see it as a banner without interrupting their flow.' }
	];

	let activeAnnotation = $state(null);

	function toggleAnnotation(id) {
		activeAnnotation = activeAnnotation === id ? null : id;
	}
</script>

<div class="ws-guide__demo">
	<div class="ws-guide__demo-header">
		<h4>Live Demo — Simulated Session</h4>
		<p class="ws-guide__demo-subtitle">This is mock data showing what a real session looks like. Try clicking room cards and the nudge button.</p>
	</div>

	<!-- Annotation legend -->
	<div class="ws-guide__annotations">
		{#each annotations as ann}
			<button
				class="ws-guide__annotation-btn"
				class:ws-guide__annotation-btn--active={activeAnnotation === ann.id}
				onclick={() => toggleAnnotation(ann.id)}
			>
				<span class="ws-guide__annotation-badge">{ann.id}</span>
				{ann.label}
			</button>
		{/each}
	</div>

	{#if activeAnnotation}
		{@const ann = annotations.find(a => a.id === activeAnnotation)}
		<div class="ws-guide__annotation-detail">
			<strong>{ann.label}:</strong> {ann.description}
		</div>
	{/if}

	<!-- Simulated Monitor -->
	<div class="ws-guide__demo-monitor">
		<div class="ws-guide__demo-annotation" data-annotation="1">
			<OverviewBar {rooms} connected={true} />
		</div>

		<div class="ws-room-grid">
			{#each rooms as room (room.id)}
				<div class="ws-guide__demo-annotation" data-annotation={room._status === 'red' ? '2' : room._status === 'green' ? '3' : room._status === 'yellow' ? '2' : ''}>
					<RoomCard {room} {totalRounds} onNudge={openNudge} />
				</div>
			{/each}
		</div>
	</div>

	<!-- Demo nudge modal — uses demoMode to skip API call -->
	{#if nudgeVisible}
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="ws-modal-overlay ws-modal-overlay--visible" onclick={(e) => { if (e.target === e.currentTarget) closeNudge(); }} onkeydown={(e) => { if (e.key === 'Escape') closeNudge(); }} role="dialog" aria-modal="true" aria-label="Demo: Send nudge to Room {nudgeRoomId}">
			<div class="ws-modal">
				<div class="ws-guide__demo-badge">DEMO MODE</div>
				<h3>Send Nudge</h3>
				<p>To Room {nudgeRoomId}</p>
				{#if nudgeSuggested}
					<div class="ws-guide__callout" style="margin-bottom: 12px;">
						<strong>AI Suggestion:</strong> {nudgeSuggested}
					</div>
				{/if}
				<p style="color: var(--ci-text-muted); font-size: 14px;">In a real session, clicking "Send Nudge" delivers this message directly to the students' screen. They see it as a banner at the top.</p>
				<div class="ws-modal__footer">
					<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={closeNudge}>Close Demo</button>
				</div>
			</div>
		</div>
	{/if}
</div>
