<script>
	import { onMount } from 'svelte';
	import { api } from '$lib/api.js';
	import WaitingDots from '$lib/components/WaitingDots.svelte';

	let { sessionId, sessionName = '', onBack } = $props();

	let loading = $state(true);
	let error = $state('');
	let analytics = $state(null);

	// Analytics cache (module-level)
	const cache = {};

	// Room sort
	let sortBy = $state('status');

	async function loadAnalytics() {
		loading = true;
		error = '';

		try {
			if (cache[sessionId]) {
				analytics = cache[sessionId];
				loading = false;
				return;
			}
			const data = await api('workshop-analytics', { params: { sessionId } });
			cache[sessionId] = data.analytics;
			analytics = data.analytics;
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function retry() {
		delete cache[sessionId];
		loadAnalytics();
	}

	function formatDate(iso) {
		if (!iso) return '\u2014';
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	let computed = $derived(analytics?.computed);
	let aiAnalysis = $derived(analytics?.aiAnalysis);

	let overviewStats = $derived.by(() => {
		if (!computed) return [];
		return [
			{ value: formatDate(computed.session.created), label: 'Date' },
			{ value: computed.session.durationMinutes != null ? computed.session.durationMinutes + 'm' : '\u2014', label: 'Duration' },
			{ value: computed.session.roomCount, label: 'Rooms' },
			{ value: computed.session.studentCount, label: 'Students' },
			{ value: computed.session.totalQuestions, label: 'Questions' },
			{ value: computed.aggregates.totalWords.toLocaleString(), label: 'Total Words' }
		];
	});

	let engagement = $derived(computed?.engagement);
	let engagementTotal = $derived.by(() => {
		if (!engagement) return 0;
		const d = engagement.distribution;
		return d.red + d.yellow + d.green + d.unclassified;
	});

	let engagementSegments = $derived.by(() => {
		if (!engagement || engagementTotal === 0) return [];
		const d = engagement.distribution;
		return [
			{ cls: 'green', count: d.green },
			{ cls: 'yellow', count: d.yellow },
			{ cls: 'red', count: d.red },
			{ cls: 'grey', count: d.unclassified }
		].filter((s) => s.count > 0);
	});

	let aiSections = $derived.by(() => {
		if (!aiAnalysis) return [];
		return [
			{ title: 'Patterns Observed', items: aiAnalysis.patterns },
			{ title: 'What Worked', items: aiAnalysis.whatWorked },
			{ title: 'Areas for Improvement', items: aiAnalysis.areasForImprovement },
			{ title: 'Recommendations', items: aiAnalysis.recommendations }
		].filter((s) => s.items?.length);
	});

	let sortedRooms = $derived.by(() => {
		if (!computed?.rooms) return [];
		const statusOrder = { red: 0, yellow: 1, green: 2 };
		return [...computed.rooms].sort((a, b) => {
			if (sortBy === 'status') return (statusOrder[a.finalStatus] ?? 3) - (statusOrder[b.finalStatus] ?? 3);
			if (sortBy === 'words') return (b.totalWordCount || 0) - (a.totalWordCount || 0);
			return String(a.roomId).localeCompare(String(b.roomId), undefined, { numeric: true });
		});
	});

	let roomsWithProfiles = $derived.by(() => {
		if (!computed?.rooms) return [];
		return computed.rooms.filter((r) => r.capabilityProfile?.capabilities?.length);
	});

	let allCapabilities = $derived(roomsWithProfiles.flatMap((r) => (r.capabilityProfile.capabilities || []).map((c) => c.capability)));

	let showCapabilities = $derived(roomsWithProfiles.length > 0 || aiAnalysis?.capabilityHighlights?.length > 0);

	let profileCount = $derived.by(() => {
		if (!computed?.rooms) return 0;
		return computed.rooms.reduce((sum, r) => {
			const profiles = Array.isArray(r.capabilityProfiles) ? r.capabilityProfiles : (r.capabilityProfile ? [r.capabilityProfile] : []);
			return sum + profiles.length;
		}, 0);
	});

	function downloadProfiles() {
		if (!computed?.rooms) return;
		const allProfiles = [];
		for (const r of computed.rooms) {
			const profiles = Array.isArray(r.capabilityProfiles) ? r.capabilityProfiles : (r.capabilityProfile ? [r.capabilityProfile] : []);
			for (const p of profiles) {
				allProfiles.push({
					roomId: r.roomId,
					studentName: p.studentName || null,
					round: p.round || null,
					summary: p.summary || '',
					capabilities: p.capabilities || [],
					generatedAt: p.generatedAt || null,
				});
			}
		}
		if (allProfiles.length === 0) return;
		const exportData = {
			sessionId,
			exportedAt: new Date().toISOString(),
			profileCount: allProfiles.length,
			profiles: allProfiles,
		};
		const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `profiles-${sessionId}-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function downloadAnalytics() {
		if (!analytics) return;
		const blob = new Blob([JSON.stringify(analytics, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `analytics-${sessionId}-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(() => {
		loadAnalytics();
	});
</script>

<div class="ws-dash-toolbar">
	<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onBack}>Back to Sessions</button>
	<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={downloadAnalytics}>Download Analytics</button>
	{#if profileCount > 0}
		<button class="ws-btn ws-btn--small" onclick={downloadProfiles}>Download Profiles ({profileCount})</button>
	{/if}
</div>

{#if loading}
	<div style="max-width:600px;margin:24px auto;">
		<div class="ws-skeleton-row">
			{#each Array(4) as _}
				<div class="ws-skeleton ws-skeleton-stat"></div>
			{/each}
		</div>
		<div class="ws-skeleton ws-skeleton-bar" style="margin-top:16px;"></div>
		<div class="ws-skeleton ws-skeleton-text" style="margin-top:16px;"></div>
		<div class="ws-skeleton ws-skeleton-text ws-skeleton-text--short"></div>
		<div class="ws-skeleton-row" style="margin-top:24px;">
			<div class="ws-skeleton ws-skeleton-card"></div>
			<div class="ws-skeleton ws-skeleton-card"></div>
		</div>
		<p style="text-align:center;margin-top:16px;color:var(--ci-text-muted);font-size:14px;">Generating analytics&hellip; this may take a moment.</p>
	</div>
{:else if error}
	<div class="ws-empty-state" style="max-width:500px;margin:40px auto;">
		<div class="ws-empty-state__icon">
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		</div>
		<p class="ws-empty-state__title">Unable to load analytics</p>
		<p class="ws-empty-state__text" style="margin-bottom:16px;">{error}</p>
		<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={retry}>Try Again</button>
	</div>
{:else if analytics}
	<!-- Session Overview -->
	<div class="ws-card ws-analytics-overview">
		<h2 style="margin:0 0 4px;">{sessionName || computed.session.name || computed.session.id}</h2>
		<div class="ws-analytics-overview__stats">
			{#each overviewStats as stat}
				<div class="ws-analytics-stat">
					<span class="ws-analytics-stat__value">{stat.value}</span>
					<span class="ws-analytics-stat__label">{stat.label}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Engagement Breakdown -->
	<div class="ws-card">
		<h3 style="margin:0 0 12px;">Engagement Breakdown</h3>
		{#if engagementTotal === 0}
			<p style="color:var(--ci-text-muted);">No engagement data.</p>
		{:else}
			<div class="ws-analytics-bar">
				{#each engagementSegments as seg}
					<div class="ws-analytics-bar__seg ws-analytics-bar__seg--{seg.cls}" style="width:{(seg.count / engagementTotal) * 100}%"></div>
				{/each}
			</div>
			<div class="ws-analytics-legend">
				<span class="ws-analytics-legend__item"><span class="ws-overview__dot ws-overview__dot--green"></span> Green: {engagement.distribution.green}</span>
				<span class="ws-analytics-legend__item"><span class="ws-overview__dot ws-overview__dot--yellow"></span> Yellow: {engagement.distribution.yellow}</span>
				<span class="ws-analytics-legend__item"><span class="ws-overview__dot ws-overview__dot--red"></span> Red: {engagement.distribution.red}</span>
				{#if engagement.distribution.unclassified > 0}
					<span class="ws-analytics-legend__item"><span class="ws-overview__dot" style="background:var(--ci-text-muted);"></span> Unclassified: {engagement.distribution.unclassified}</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- AI Analysis -->
	<div class="ws-card">
		<h3 style="margin:0 0 12px;">AI Analysis</h3>
		{#if aiAnalysis?.overallAssessment}
			<p class="ws-analytics-assessment">{aiAnalysis.overallAssessment}</p>
		{/if}
		{#if aiAnalysis?.engagementNarrative}
			<p style="color:var(--ci-text-muted);font-size:15px;margin:0 0 16px;">{aiAnalysis.engagementNarrative}</p>
		{/if}
		{#each aiSections as section}
			<h4 class="ws-analytics-subhead">{section.title}</h4>
			<ul class="ws-analytics-list">
				{#each section.items as item}
					<li>{item}</li>
				{/each}
			</ul>
		{/each}
	</div>

	<!-- Room Performance -->
	<div class="ws-card">
		<h3 style="margin:0 0 12px;">Room Performance</h3>
		<div class="ws-analytics-sort-row">
			<button class="ws-btn ws-btn--small ws-btn--secondary" class:ws-analytics-sort--active={sortBy === 'status'} onclick={() => sortBy = 'status'}>By Status</button>
			<button class="ws-btn ws-btn--small ws-btn--secondary" class:ws-analytics-sort--active={sortBy === 'words'} onclick={() => sortBy = 'words'}>By Word Count</button>
			<button class="ws-btn ws-btn--small ws-btn--secondary" class:ws-analytics-sort--active={sortBy === 'room'} onclick={() => sortBy = 'room'}>By Room #</button>
		</div>
		<div class="ws-analytics-room-grid">
			{#each sortedRooms as room (room.roomId)}
				{@const sc = room.finalStatus || 'none'}
				<div class="ws-analytics-room-card">
					<div class="ws-analytics-room-card__top">
						<span class="ws-analytics-room-card__id">Room {room.roomId}</span>
						<span class="ws-room-card__status ws-room-card__status--{sc}"><span class="ws-room-card__status-dot"></span>{sc}</span>
					</div>
					<div class="ws-analytics-room-card__students">
						{#if room.students.length > 0}
							{room.students.join(', ')}
						{:else}
							<em>No students</em>
						{/if}
					</div>
					<div class="ws-analytics-room-card__meta">
						<span>{room.totalWordCount.toLocaleString()} words</span>
						<span>{room.submissionCount} submissions</span>
						{#if room.nudgeCount > 0}
							<span>{room.nudgeCount} nudges</span>
						{/if}
						<span>{room.roundsCompleted}/{room.totalRounds} rounds</span>
					</div>
					{#if room.capabilityProfile?.summary}
						<div class="ws-analytics-room-card__profile">{room.capabilityProfile.summary}</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Capability Highlights -->
	{#if showCapabilities}
		<div class="ws-card">
			<h3 style="margin:0 0 12px;">Capability Highlights</h3>
			{#if aiAnalysis?.capabilityHighlights?.length}
				<ul class="ws-analytics-list">
					{#each aiAnalysis.capabilityHighlights as highlight}
						<li>{highlight}</li>
					{/each}
				</ul>
			{/if}
			{#if allCapabilities.length > 0}
				<div class="ws-capability-tags" style="margin-top:12px;">
					{#each allCapabilities as cap}
						<span class="ws-capability-tag">{cap}</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/if}
