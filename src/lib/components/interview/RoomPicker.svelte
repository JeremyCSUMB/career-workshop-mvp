<script>
	import { interviewState } from '$lib/stores/interview.js';

	let { rooms = [], onJoinRoom, onSwitchSession } = $props();

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
		{/each}
	</div>
	<div class="ws-btn-row" style="justify-content:center;margin-top:20px;">
		<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onSwitchSession}>Join a Different Session</button>
	</div>
</div>
