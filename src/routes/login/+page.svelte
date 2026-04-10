<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';

	let checking = $state(true);

	// Get redirect param if present
	let redirectUrl = $derived($page.url.searchParams.get('redirect') || '/interview');

	onMount(async () => {
		try {
			const res = await fetch('/.netlify/functions/auth-session');
			if (res.ok) {
				const data = await res.json();
				if (data.authenticated) {
					goto(redirectUrl);
					return;
				}
			}
		} catch {
			// Not authenticated, show login page
		}
		checking = false;
	});

	function handleSignIn() {
		const loginUrl = new URL('/.netlify/functions/auth-login', window.location.origin);
		if (redirectUrl && redirectUrl !== '/interview') {
			loginUrl.searchParams.set('redirect', redirectUrl);
		}
		window.location.href = loginUrl.toString();
	}
</script>

{#if checking}
	<div class="ws-container login-container">
		<div class="ws-card login-card">
			<p class="login-checking">Checking session...</p>
		</div>
	</div>
{:else}
	<div class="ws-container login-container">
		<div class="ws-card login-card">
			<div class="login-branding">
				<h1 class="login-title">Career Intelligence Workshop</h1>
				<p class="login-subtitle">Sign in to join the workshop</p>
			</div>

			<button class="google-btn" onclick={handleSignIn}>
				<svg class="google-icon" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
					<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
					<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
					<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
					<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
				</svg>
				<span>Sign in with Google</span>
			</button>
		</div>
	</div>
{/if}

<style>
	.login-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 80vh;
	}

	.login-card {
		max-width: 400px;
		margin: 0 auto;
		text-align: center;
	}

	.login-branding {
		margin-bottom: 32px;
	}

	.login-title {
		font-size: 24px;
		font-weight: 700;
		margin: 0 0 8px;
	}

	.login-subtitle {
		color: var(--color-text-muted);
		margin: 0;
		font-size: 15px;
	}

	.login-checking {
		color: var(--color-text-muted);
		margin: 0;
	}

	.google-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		width: 100%;
		height: 44px;
		padding: 0 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 15px;
		font-weight: 500;
		color: var(--color-text);
		cursor: pointer;
		transition: all var(--transition);
	}

	.google-btn:hover {
		background: var(--color-surface-raised);
		border-color: var(--color-text-muted);
	}

	.google-btn:active {
		transform: scale(0.98);
	}

	.google-icon {
		flex-shrink: 0;
	}
</style>
