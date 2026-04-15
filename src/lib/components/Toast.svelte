<script>
	let { message = '', duration = 5000, type = 'info', visible = $bindable(false) } = $props();

	let showing = $state(false);
	let dismissing = $state(false);
	let timer = null;

	function dismiss() {
		dismissing = true;
		setTimeout(() => {
			showing = false;
			dismissing = false;
			visible = false;
		}, 300);
	}

	$effect(() => {
		if (visible) {
			showing = true;
			dismissing = false;
			clearTimeout(timer);
			timer = setTimeout(() => dismiss(), duration);
		}
		return () => clearTimeout(timer);
	});
</script>

{#if showing}
	<div
		class="ws-toast ws-toast--{type}"
		class:ws-toast--dismissing={dismissing}
		role="status"
		aria-live="polite"
	>
		{message}
	</div>
{/if}

<style>
	.ws-toast {
		position: fixed;
		bottom: 24px;
		right: 24px;
		padding: 12px 20px;
		border-radius: 8px;
		border: 1px solid var(--ci-border);
		background: var(--ci-surface);
		color: var(--ci-text);
		font-size: 0.95rem;
		max-width: 360px;
		z-index: 1000;
		animation: ws-toast-slide-in 0.3s ease-out;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.ws-toast--dismissing {
		animation: ws-toast-fade-out 0.3s ease-in forwards;
	}

	.ws-toast--success {
		border-color: #22c55e;
		background: #f0fdf4;
		color: #166534;
	}

	.ws-toast--warning {
		border-color: #f59e0b;
		background: #fffbeb;
		color: #92400e;
	}

	:global(.dark) .ws-toast--success {
		background: #14532d;
		color: #bbf7d0;
	}

	:global(.dark) .ws-toast--warning {
		background: #78350f;
		color: #fef3c7;
	}

	@keyframes ws-toast-slide-in {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@keyframes ws-toast-fade-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
</style>
