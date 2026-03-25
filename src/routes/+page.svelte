<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Redirect to interview page by default (matches original behavior)
	onMount(() => {
		goto('/interview');
	});
</script>

<svelte:head>
	<title>Career Intelligence Workshop</title>
</svelte:head>

<div style="text-align:center;padding:40px;">
	<p>Redirecting...</p>
</div>
