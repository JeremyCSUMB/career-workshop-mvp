<script>
	let { items = [], active = '' } = $props();
</script>

<nav class="ws-bottom-nav" class:ws-hidden={items.length === 0}>
	{#each items as item}
		<button
			class="ws-bottom-nav__item"
			class:ws-bottom-nav__item--active={active === item.id}
			aria-label={item.label}
			onclick={item.onclick}
		>
			<span class="ws-bottom-nav__icon">{item.icon}</span>
			<span>{item.label}</span>
		</button>
	{/each}
</nav>
