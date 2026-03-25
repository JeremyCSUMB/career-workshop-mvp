<script>
	import { WORKSHOP_CONFIG as CFG } from '$lib/config.js';

	let { onLogin } = $props();

	let password = $state('');
	let error = $state('');

	function handleLogin() {
		if (password === CFG.dashboard_password) {
			error = '';
			onLogin();
		} else {
			error = 'Incorrect password.';
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
		<button class="ws-btn" onclick={handleLogin}>Log In</button>
	</div>
</div>
