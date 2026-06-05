<script>
	import { api } from '$lib/api.js';

	let { onLogin } = $props();

	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin() {
		loading = true;
		try {
			await api('auth-dashboard-login', { body: { password } });
			error = '';
			onLogin();
		} catch {
			error = 'Incorrect password.';
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Enter') handleLogin();
	}
</script>

<div class="ws-card" style="max-width:400px;margin:0 auto;">
	<h2>Facilitator Login</h2>
	<div class="ws-field">
		<label class="ws-label" for="login-password">Password</label>
		<input
			id="login-password"
			class="ws-input"
			type="password"
			placeholder="Enter password"
			bind:value={password}
			onkeydown={handleKeydown}
		/>
	</div>
	{#if error}
		<div class="ws-error">{error}</div>
	{/if}
	<div class="ws-btn-row">
		<button class="ws-btn" onclick={handleLogin} disabled={loading}>{loading ? 'Logging in...' : 'Log In'}</button>
	</div>
</div>
