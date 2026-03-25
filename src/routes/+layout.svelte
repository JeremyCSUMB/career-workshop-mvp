<script>
	import '../app.css';
	import { theme } from '$lib/stores/theme.js';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		theme.init();
	});
</script>

{@render children()}

<button
	class="ws-theme-toggle"
	aria-label="Toggle dark mode"
	title="Toggle dark mode"
	onclick={() => theme.toggle()}
>
	{$theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
</button>
