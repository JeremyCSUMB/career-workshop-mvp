<script>
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api.js';
	import SessionCard from './SessionCard.svelte';

	let { onMonitor, onAnalytics } = $props();

	const DEFAULT_PROMPT = "Tell your partner about a time you had to figure something out where there wasn't a clear answer. Any context \u2014 work, school, personal. Don't pick the most impressive story. Pick what comes to mind first. 3-4 minutes.";

	let sessionName = $state('');
	let roomCount = $state('');
	let questionCount = $state(1);
	let prompts = $state([DEFAULT_PROMPT]);
	let createError = $state('');
	let creating = $state(false);

	let liveSessions = $state([]);
	let endedSessions = $state([]);
	let loading = $state(true);

	$effect(() => {
		const count = Math.max(1, Math.min(10, questionCount || 1));
		while (prompts.length < count) prompts.push(DEFAULT_PROMPT);
		if (prompts.length > count) prompts = prompts.slice(0, count);
	});

	function updatePrompt(idx, value) {
		prompts[idx] = value;
	}

	async function handleCreate() {
		const name = sessionName.trim();
		const rooms = parseInt(roomCount, 10);
		const questions = Math.max(1, Math.min(10, questionCount || 1));
		createError = '';

		if (!name) { createError = 'Please enter a session name.'; return; }
		if (!rooms || rooms < 1) { createError = 'Please enter a valid room count.'; return; }

		const finalPrompts = prompts.map((p) => p.trim() || DEFAULT_PROMPT);
		creating = true;

		try {
			const data = await api('workshop-session', {
				body: { name, roomCount: rooms, rounds: questions * 2, questions, prompts: finalPrompts }
			});
			const id = data.session?.id || data.sessionId || data.id;
			onMonitor(id);
		} catch (err) {
			createError = err.message;
		} finally {
			creating = false;
		}
	}

	async function loadSessions() {
		loading = true;
		try {
			const data = await api('workshop-session');
			const sessions = data.sessions || [];
			liveSessions = sessions.filter((s) => !s.ended).sort((a, b) => new Date(b.created) - new Date(a.created));
			endedSessions = sessions.filter((s) => s.ended).sort((a, b) => new Date(b.endedAt || b.created) - new Date(a.endedAt || a.created));
		} catch {
			// silent
		} finally {
			loading = false;
		}
	}

	function handleReload() {
		loadSessions();
	}

	onMount(() => {
		loadSessions();
		window.addEventListener('ws-sessions-reload', handleReload);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('ws-sessions-reload', handleReload);
		}
	});
</script>

<div style="max-width:600px;margin:0 auto;">
	<div class="ws-card" style="margin-bottom:24px;">
		<h2>Create New Session</h2>
		<div class="ws-field">
			<label class="ws-label" for="new-session-name">Session Name</label>
			<input id="new-session-name" class="ws-input" type="text" placeholder="e.g. CST395 Week 10" bind:value={sessionName} />
		</div>
		<div class="ws-field">
			<label class="ws-label" for="new-room-count">Number of Rooms</label>
			<input id="new-room-count" class="ws-input" type="number" min="1" max="50" placeholder="e.g. 12" bind:value={roomCount} />
		</div>
		<div class="ws-field">
			<label class="ws-label" for="new-round-count">Number of Questions</label>
			<input id="new-round-count" class="ws-input" type="number" min="1" max="10" bind:value={questionCount} />
			<div style="font-size:12px;color:var(--ci-text-muted);margin-top:4px;">Each question is a full cycle &mdash; both partners take turns interviewing and sharing.</div>
		</div>
		<div class="ws-field">
			<label class="ws-label">Question Prompts <span style="font-weight:400;color:var(--ci-text-muted);">(edit to customize)</span></label>
			{#each prompts as prompt, idx}
				<div style="margin-bottom:12px;">
					<label class="ws-label" style="font-size:13px;margin-bottom:4px;">Question {idx + 1}</label>
					<textarea
						class="ws-textarea"
						style="min-height:60px;"
						placeholder="Leave blank to use the default prompt"
						value={prompt}
						oninput={(e) => updatePrompt(idx, e.target.value)}
					></textarea>
				</div>
			{/each}
			<div style="font-size:12px;color:var(--ci-text-muted);margin-top:4px;">Each question shows the same prompt for both turns. Edit any prompt or leave as default.</div>
		</div>
		{#if createError}
			<div class="ws-error">{createError}</div>
		{/if}
		<div class="ws-btn-row">
			<button class="ws-btn" onclick={handleCreate} disabled={creating}>
				{creating ? 'Creating...' : 'Create Session'}
			</button>
		</div>
	</div>

	<h2 style="font-size:18px;margin:0 0 12px;">Live Sessions</h2>
	{#if loading}
		<p style="color:var(--ci-text-muted);font-size:14px;">Loading sessions...</p>
	{:else if liveSessions.length === 0}
		<p style="color:var(--ci-text-muted);font-size:14px;">No active sessions. Create one above.</p>
	{:else}
		{#each liveSessions as s (s.id)}
			<SessionCard session={s} {onMonitor} {onAnalytics} />
		{/each}
	{/if}

	{#if endedSessions.length > 0}
		<div style="margin-top:32px;">
			<h2 style="font-size:18px;margin:0 0 12px;color:var(--ci-text-muted);">Previous Sessions</h2>
			{#each endedSessions as s (s.id)}
				<SessionCard session={s} isEnded={true} {onMonitor} {onAnalytics} />
			{/each}
		</div>
	{/if}
</div>
