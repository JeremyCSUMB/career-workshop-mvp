<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { fade, fly } from 'svelte/transition';
	import LoginScreen from '$lib/components/dashboard/LoginScreen.svelte';
	import SessionScreen from '$lib/components/dashboard/SessionScreen.svelte';
	import MonitorScreen from '$lib/components/dashboard/MonitorScreen.svelte';
	import AnalyticsScreen from '$lib/components/dashboard/AnalyticsScreen.svelte';
	import GuideScreen from '$lib/components/dashboard/GuideScreen.svelte';
	import GuideChatBubble from '$lib/components/dashboard/GuideChatBubble.svelte';
	import ProjectorScreen from '$lib/components/dashboard/ProjectorScreen.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import UserProfileMenu from '$lib/components/UserProfileMenu.svelte';

	let screen = $state('login'); // login | session | dashboard | analytics | guide
	let sessionId = $state('');
	let analyticsSessionId = $state('');
	let analyticsSessionName = $state('');
	let subtitle = $state('Facilitator view');
	let showWelcomeBanner = $state(false);
	let projectorSessionId = $state('');
	let projectorSessionName = $state('');
	let user = $state(null);

	// Bottom nav items
	let navItems = $derived(
		screen === 'login'
			? []
			: [
					{ id: 'sessions', label: 'Sessions', icon: '\u2630', onclick: () => navTo('sessions') },
					{ id: 'monitor', label: 'Monitor', icon: '\u25C9', onclick: () => navTo('monitor') },
					{ id: 'analytics', label: 'Analytics', icon: '\u25C6', onclick: () => navTo('analytics') },
					{ id: 'guide', label: 'Guide', icon: '?', onclick: () => navTo('guide') }
				]
	);

	let activeNav = $derived(
		screen === 'session' ? 'sessions' :
		screen === 'dashboard' ? 'monitor' :
		screen === 'analytics' ? 'analytics' :
		screen === 'guide' ? 'guide' : 'sessions'
	);

	function navTo(target) {
		if (target === 'sessions') {
			screen = 'session';
		} else if (target === 'monitor' && sessionId) {
			screen = 'dashboard';
		} else if (target === 'analytics' && analyticsSessionId) {
			screen = 'analytics';
		} else if (target === 'guide') {
			screen = 'guide';
		}
	}

	function getJoinLink(sid) {
		const base = typeof window !== 'undefined' ? window.location.origin : '';
		return `${base}/interview?code=${encodeURIComponent(sid)}`;
	}

	function handleLogin() {
		if (browser) sessionStorage.setItem('ws_dash_auth', 'true');
		// Check if this is a first-time user
		if (browser && !localStorage.getItem('ws_guide_completed')) {
			showWelcomeBanner = true;
		}
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

	function handleGuideComplete() {
		screen = 'session';
	}

	function handleProjector(sid, name) {
		projectorSessionId = sid;
		projectorSessionName = name || '';
	}

	function closeProjector() {
		projectorSessionId = '';
		projectorSessionName = '';
	}

	function dismissBanner() {
		showWelcomeBanner = false;
	}

	function goToGuide() {
		showWelcomeBanner = false;
		screen = 'guide';
	}

	let isLoggedIn = $derived(screen !== 'login');

	async function handleProfileLogout() {
		try {
			await fetch('/.netlify/functions/auth-logout', { method: 'POST' });
		} catch {}
		if (browser) {
			sessionStorage.removeItem('ws_dash_auth');
			sessionStorage.removeItem('ws_dash_sessionId');
		}
		window.location.href = '/login';
	}

	onMount(async () => {
		// Fetch user profile for avatar
		try {
			const res = await fetch('/.netlify/functions/auth-session');
			if (res.ok) {
				const data = await res.json();
				if (data.user) user = data.user;
			}
		} catch {}
		const wasAuth = sessionStorage.getItem('ws_dash_auth') === 'true';
		const savedSession = sessionStorage.getItem('ws_dash_sessionId');

		if (wasAuth && savedSession) {
			sessionId = savedSession;
			subtitle = `Session: ${savedSession}`;
			screen = 'dashboard';
		} else if (wasAuth) {
			screen = 'session';
			if (!localStorage.getItem('ws_guide_completed')) {
				showWelcomeBanner = true;
			}
		}
	});
</script>

<svelte:head>
	<title>Workshop Dashboard</title>
</svelte:head>

<header class="ws-header ws-header--wide" style="position:relative;">
	<h1>Workshop Dashboard</h1>
	<p>
		{subtitle}
		{#if sessionId && screen === 'dashboard'}
			{' \u2014 '}
			<button class="ws-link-btn" onclick={handleCopyLink}>Copy Join Link</button>
		{/if}
	</p>
	{#if user}
		<div class="ws-header__profile">
			<UserProfileMenu name={user.name} email={user.email} picture={user.picture} onLogout={handleProfileLogout} />
		</div>
	{/if}
</header>

<main class="ws-container ws-container--wide">
	<!-- Welcome banner for first-time users -->
	{#if showWelcomeBanner && screen === 'session'}
		<div class="ws-guide__welcome-banner" in:fly={{ y: -8, duration: 250 }}>
			<span>New here? Take a quick interactive tour to learn how the dashboard works.</span>
			<button class="ws-btn ws-btn--small" onclick={goToGuide}>Open Guide</button>
			<button class="ws-guide__welcome-dismiss" onclick={dismissBanner} aria-label="Dismiss">&times;</button>
		</div>
	{/if}

	{#key screen}
		<div in:fly={{ y: 4, duration: 250 }} out:fade={{ duration: 150 }}>
			{#if screen === 'login'}
				<LoginScreen onLogin={handleLogin} />
			{:else if screen === 'session'}
				<SessionScreen onMonitor={handleMonitor} onAnalytics={handleAnalytics} onProjector={handleProjector} />
			{:else if screen === 'dashboard'}
				<MonitorScreen {sessionId} onBackToSessions={handleBackToSessions} onProjector={handleProjector} />
			{:else if screen === 'analytics'}
				<AnalyticsScreen sessionId={analyticsSessionId} sessionName={analyticsSessionName} onBack={handleBackToSessions} />
			{:else if screen === 'guide'}
				<GuideScreen onComplete={handleGuideComplete} />
			{/if}
		</div>
	{/key}
</main>

{#if projectorSessionId}
	<ProjectorScreen sessionId={projectorSessionId} sessionName={projectorSessionName} onClose={closeProjector} />
{/if}

{#if isLoggedIn}
	<GuideChatBubble />
{/if}

<BottomNav items={navItems} active={activeNav} />

<style>
	.ws-header__profile {
		position: absolute;
		right: 24px;
		top: 50%;
		transform: translateY(-50%);
	}

	@media (max-width: 600px) {
		.ws-header__profile {
			right: 16px;
		}
	}
</style>
