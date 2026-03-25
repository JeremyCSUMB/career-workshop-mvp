<script>
	import { api } from '$lib/api.js';

	let { session, isEnded = false, onMonitor, onAnalytics } = $props();

	function relativeTime(isoOrMs) {
		if (!isoOrMs) return '\u2014';
		const then = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
		const diff = Math.max(0, Date.now() - then);
		const secs = Math.floor(diff / 1000);
		if (secs < 5) return 'just now';
		if (secs < 60) return `${secs}s ago`;
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ago`;
	}

	function getJoinLink(sessionId) {
		const base = typeof window !== 'undefined' ? window.location.origin : '';
		return `${base}/interview?code=${encodeURIComponent(sessionId)}`;
	}

	let copyText = $state('Copy Join Link');

	function copyJoinLink() {
		navigator.clipboard.writeText(getJoinLink(session.id)).then(() => {
			copyText = 'Copied!';
			setTimeout(() => { copyText = 'Copy Join Link'; }, 1500);
		});
	}

	async function downloadJSON() {
		try {
			const data = await api('workshop-rooms', { params: { sessionId: session.id } });
			const rooms = data.rooms || [];
			const exportData = {
				sessionId: session.id,
				sessionName: session.name || session.id,
				exportedAt: new Date().toISOString(),
				rooms: rooms.map((r) => ({
					roomId: r.id,
					students: r.students,
					currentRound: r.currentRound,
					submissions: r.submissions,
					aiFollowUps: r.aiFollowUps,
					capabilityProfile: r.capabilityProfile,
					classifications: r.classifications,
					nudges: r.nudges
				}))
			};
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `workshop-${session.id}-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			alert('Error downloading: ' + err.message);
		}
	}

	async function endSession() {
		if (!confirm(`End session "${session.name || session.id}"? This will delete all session data.`)) return;
		try {
			await api('workshop-session', { method: 'DELETE', body: { sessionId: session.id } });
			// Trigger parent reload by dispatching a custom event won't work; use callback
			window.dispatchEvent(new CustomEvent('ws-sessions-reload'));
		} catch (err) {
			alert('Error ending session: ' + err.message);
		}
	}
</script>

<div class="ws-session-card" class:ws-session-card--ended={isEnded}>
	<div class="ws-session-card__top">
		<div>
			<div class="ws-session-card__name">
				{session.name}
				{#if isEnded}
					<span style="font-size:12px;color:var(--ci-text-muted);font-weight:400;">(ended)</span>
				{/if}
			</div>
			<div class="ws-session-card__meta">
				{session.roomCount} rooms &middot; Created {relativeTime(session.created)}
				{#if isEnded && session.endedAt}
					&middot; Ended {relativeTime(session.endedAt)}
				{/if}
			</div>
		</div>
		<div class="ws-session-card__code">{session.id}</div>
	</div>
	<div class="ws-session-card__actions">
		{#if !isEnded}
			<button class="ws-btn ws-btn--small" onclick={() => onMonitor(session.id)}>Monitor</button>
			<button class="ws-btn ws-btn--small ws-btn--secondary" onclick={copyJoinLink}>{copyText}</button>
		{/if}
		{#if isEnded}
			<button class="ws-btn ws-btn--small" onclick={() => onAnalytics(session.id, session.name)}>View Analytics</button>
		{/if}
		<button class="ws-btn ws-btn--small ws-btn--secondary" onclick={downloadJSON}>Download JSON</button>
		{#if !isEnded}
			<button class="ws-btn ws-btn--small ws-btn--danger" onclick={endSession}>End Session</button>
		{/if}
	</div>
</div>
