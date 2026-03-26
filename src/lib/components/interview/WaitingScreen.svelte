<script>
	import WaitingDots from '$lib/components/WaitingDots.svelte';

	let { students = [], onChangeRoom } = $props();

	$effect(() => {
		// This component re-renders as students array changes
	});
</script>

<div class="ws-card ws-card--centered">
	<div class="ws-waiting" aria-live="polite">
		<WaitingDots />
		{#if students.length >= 2}
			<p>Both partners are here!</p>
			<div class="ws-partner-names">
				{#each students as name}
					<span class="ws-partner-name">{name}</span>
				{/each}
			</div>
		{:else}
			<p>Waiting for your partner to join...</p>
		{/if}
		<div class="ws-btn-row" style="justify-content:center;margin-top:20px;">
			<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onChangeRoom}>Change Room</button>
		</div>
	</div>
</div>
