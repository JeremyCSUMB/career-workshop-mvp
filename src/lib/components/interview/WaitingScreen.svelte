<script>
	import WaitingDots from '$lib/components/WaitingDots.svelte';

	let { students = [], roomSize = 2, onChangeRoom } = $props();

	$effect(() => {
		// This component re-renders as students array changes
	});
</script>

<div class="ws-card ws-card--centered">
	<div class="ws-waiting" aria-live="polite">
		<WaitingDots />
		{#if students.length >= roomSize}
			<p>{roomSize === 3 ? 'Everyone is here!' : 'Both partners are here!'}</p>
			<div class="ws-partner-names">
				{#each students as name}
					<span class="ws-partner-name">{name}</span>
				{/each}
			</div>
		{:else}
			<p>Waiting for {roomSize === 3 ? 'your room to fill' : 'your partner to join'}...</p>
			<p style="color:var(--ci-text-muted);font-size:14px;margin-top:4px;">{students.length} / {roomSize} joined</p>
		{/if}
		<div class="ws-btn-row" style="justify-content:center;margin-top:20px;">
			<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onChangeRoom}>Change Room</button>
		</div>
	</div>
</div>
