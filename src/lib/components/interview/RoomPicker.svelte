<script>
	import { interviewState } from '$lib/stores/interview.js';

	let { rooms = [], onJoinRoom, onSwitchSession, claimState = null, onClaimSlot, onCancelClaim } = $props();

	function statusText(count) {
		if (count === 0) return 'Empty';
		if (count === 1) return '1 / 2';
		return 'Full';
	}

	function getNames(room) {
		const students = room.students;
		if (!students) return [];
		if (Array.isArray(students)) return students;
		return Object.values(students).filter(Boolean);
	}
</script>

<div class="ws-card">
	<h2>Choose a Room</h2>
	<p>Select an available room to join.</p>
	<div class="ws-rooms-picker">
		{#each rooms as room}
			{@const names = getNames(room)}
			{@const count = names.length}
			{@const isFull = count >= 2}
			{@const alreadyIn = names.includes($interviewState.studentName)}
			<div
				class="ws-room-pick"
				class:ws-room-pick--full={isFull && !alreadyIn}
				class:ws-room-pick--yours={alreadyIn}
				style:cursor={!isFull || alreadyIn ? 'pointer' : 'not-allowed'}
				onclick={() => (!isFull || alreadyIn) && onJoinRoom(room.id)}
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && (!isFull || alreadyIn) && onJoinRoom(room.id)}
			>
				<div class="ws-room-pick__number">Room {room.id}</div>
				<div class="ws-room-pick__status">{statusText(count)}</div>
				<div class="ws-room-pick__names">
					{#if names.length > 0}
						{#each names as name}
							<span>{name}</span>
						{/each}
					{:else}
						<span style="color:var(--ci-text-muted)">No one yet</span>
					{/if}
				</div>
				{#if alreadyIn}
					<div class="ws-room-pick__badge">You are here — click to rejoin</div>
				{/if}
			</div>
			{#if claimState?.roomId === String(room.id)}
				<div class="ws-claim-panel">
					<p>This room is full. Were you one of these people?</p>
					<div class="ws-btn-row">
						{#each Object.entries(claimState.students).filter(([, name]) => name) as [slot, name]}
							<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={() => onClaimSlot(room.id, slot)}>{name}</button>
						{/each}
						<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onCancelClaim}>Cancel</button>
					</div>
				</div>
			{/if}
		{/each}
	</div>
	<div class="ws-btn-row" style="justify-content:center;margin-top:20px;">
		<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onSwitchSession}>Join a Different Session</button>
	</div>
</div>

<style>
	.ws-claim-panel {
		margin-top: 8px;
		padding: 12px 16px;
		background: var(--ci-bg-muted, #f5f5f5);
		border-radius: 8px;
		border: 1px solid var(--ci-border, #ddd);
	}
	.ws-claim-panel p {
		margin: 0 0 10px;
		font-size: 0.9rem;
	}
</style>
