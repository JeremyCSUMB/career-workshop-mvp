<script>
	let { name = '', email = '', picture = '', onLogout } = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
	}

	function handleClickOutside(e) {
		if (open) {
			open = false;
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Escape' && open) {
			open = false;
		}
	}

	function handleLogout() {
		open = false;
		onLogout?.();
	}

	let initial = $derived(name ? name.charAt(0).toUpperCase() : '?');
</script>

<svelte:window on:keydown={handleKeydown} on:click={handleClickOutside} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="upm" onclick={(e) => e.stopPropagation()}>
	<button class="upm__avatar-btn" onclick={toggle} aria-label="Profile menu" aria-expanded={open}>
		{#if picture}
			<img
				class="upm__avatar"
				src={picture}
				alt={name}
				referrerpolicy="no-referrer"
				width="36"
				height="36"
			/>
		{:else}
			<span class="upm__avatar upm__avatar--fallback">{initial}</span>
		{/if}
	</button>

	{#if open}
		<div class="upm__dropdown">
			<div class="upm__user-info">
				{#if picture}
					<img
						class="upm__avatar-lg"
						src={picture}
						alt={name}
						referrerpolicy="no-referrer"
						width="48"
						height="48"
					/>
				{:else}
					<span class="upm__avatar-lg upm__avatar--fallback">{initial}</span>
				{/if}
				<div class="upm__details">
					<span class="upm__name">{name}</span>
					<span class="upm__email">{email}</span>
				</div>
			</div>
			<hr class="upm__divider" />
			<button class="ws-btn ws-btn--secondary ws-btn--small upm__logout" onclick={handleLogout}>
				Sign out
			</button>
		</div>
	{/if}
</div>

<style>
	.upm {
		position: relative;
		display: inline-flex;
	}

	.upm__avatar-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 50%;
		transition: box-shadow var(--ci-duration) var(--ci-transition);
	}

	.upm__avatar-btn:hover {
		box-shadow: 0 0 0 2px var(--ci-accent);
	}

	.upm__avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.upm__avatar--fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ci-accent);
		color: #fff;
		font-weight: 600;
		font-size: 16px;
		font-family: var(--ci-font);
	}

	.upm__avatar-lg {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.upm__dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 240px;
		background: var(--ci-surface);
		border: 1px solid var(--ci-border);
		border-radius: var(--ci-radius-lg);
		box-shadow: 0 4px 24px var(--ci-shadow-medium);
		padding: 16px;
		z-index: 100;
	}

	.upm__user-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.upm__details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.upm__name {
		font-weight: 600;
		font-size: 15px;
		color: var(--ci-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.upm__email {
		font-size: 13px;
		color: var(--ci-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.upm__divider {
		border: none;
		border-top: 1px solid var(--ci-border);
		margin: 12px 0;
	}

	.upm__logout {
		width: 100%;
	}

	@media (max-width: 600px) {
		.upm__dropdown {
			right: -8px;
			min-width: 220px;
		}
	}
</style>
