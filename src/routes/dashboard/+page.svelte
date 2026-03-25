<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { fade, fly } from 'svelte/transition';
	import LoginScreen from '$lib/components/dashboard/LoginScreen.svelte';
	import SessionScreen from '$lib/components/dashboard/SessionScreen.svelte';
	import MonitorScreen from '$lib/components/dashboard/MonitorScreen.svelte';
	import AnalyticsScreen from '$lib/components/dashboard/AnalyticsScreen.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';

	let screen = $state('login'); // login | session | dashboard | analytics
	let sessionId = $state('');
	let analyticsSessionId = $state('');
	let analyticsSessionName = $state('');
	let subtitle = $state('Facilitator view');

	// Bottom nav items
	let navItems = $derived(
		screen === 'login'
			? []
			: [
					{ id: 'sessions', label: 'Sessions', icon: '\u2630', onclick: () => navTo('sessions') },
					{ id: 'monitor', label: 'Monitor', icon: '\u25C9', onclick: () => navTo('monitor') },
					{ id: 'analytics', label: 'Analytics', icon: '\u25C6', onclick: () => navTo('analytics') }
				]
	);

	let activeNav = $derived(
		screen === 'session' ? 'sessions' :
		screen === 'dashboard' ? 'monitor' :
		screen === 'analytics' ? 'analytics' : 'sessions'
	);

	function navTo(target) {
		if (target === 'sessions') {
			screen = 'session';
		} else if (target === 'monitor' && sessionId) {
			screen = 'dashboard';
		} else if (target === 'analytics' && analyticsSessionId) {
			screen = 'analytics';
		}
	}

	function getJoinLink(sid) {
		const base = typeof window !== 'undefined' ? window.location.origin : '';
		return `${base}/interview?code=${encodeURIComponent(sid)}`;
	}

	function handleLogin() {
		if (browser) sessionStorage.setItem('ws_dash_auth', 'true');
		screen = 'session';
	}

	function handleMonitor(sid) {
		sessionId = sid;
		if (browser) sessionStorage.setItem('ws_dash_sessionId', sid);
		subtitle = `Session: ${sid}`;
		screen = 'dashboard';
	}

	function handleAnalytics(sid, name) {
		analyticsSessionId = sid;
		analyticsSessionName = name || sid;
		screen = 'analytics';
	}

	function handleBackToSessions() {
		sessionId = '';
		if (browser) sessionStorage.removeItem('ws_dash_sessionId');
		subtitle = 'Facilitator view';
		screen = 'session';
	}

	function handleCopyLink() {
		if (!sessionId) return;
		const link = getJoinLink(sessionId);
		navigator.clipboard.writeText(link);
	}

	onMount(() => {
		const wasAuth = sessionStorage.getItem('ws_dash_auth') === 'true';
		const savedSession = sessionStorage.getItem('ws_dash_sessionId');

		if (wasAuth && savedSession) {
			sessionId = savedSession;
			subtitle = `Session: ${savedSession}`;
			screen = 'dashboard';
		} else if (wasAuth) {
			screen = 'session';
		}
	});
</script>

<svelte:head>
	<title>Workshop Dashboard</title>
</svelte:head>

<header class="ws-header ws-header--wide">
	<h1>Workshop Dashboard</h1>
	<p>
		{subtitle}
		{#if sessionId && screen === 'dashboard'}
			{' \u2014 '}
			<button class="ws-link-btn" onclick={handleCopyLink}>Copy Join Link</button>
		{/if}
	</p>
</header>

<main class="ws-container ws-container--wide">
	{#key screen}
		<div in:fly={{ y: 6, duration: 300 }} out:fade={{ duration: 150 }}>
			{#if screen === 'login'}
				<LoginScreen onLogin={handleLogin} />
			{:else if screen === 'session'}
				<SessionScreen onMonitor={handleMonitor} onAnalytics={handleAnalytics} />
			{:else if screen === 'dashboard'}
				<MonitorScreen {sessionId} onBackToSessions={handleBackToSessions} />
			{:else if screen === 'analytics'}
				<AnalyticsScreen sessionId={analyticsSessionId} sessionName={analyticsSessionName} onBack={handleBackToSessions} />
			{/if}
		</div>
	{/key}
</main>

<BottomNav items={navItems} active={activeNav} />
