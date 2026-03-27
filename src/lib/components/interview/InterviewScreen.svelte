<script>
	import { api } from '$lib/api.js';
	import { WORKSHOP_CONFIG as CFG } from '$lib/config.js';
	import { interviewState } from '$lib/stores/interview.js';
	import WaitingDots from '$lib/components/WaitingDots.svelte';
	import { onMount, onDestroy } from 'svelte';

	let { onComplete, onChangeRoom } = $props();

	const MIN_CHARS = 80;

	// Derived state
	let round = $derived($interviewState.round);
	let totalRounds = $derived($interviewState.totalRounds);
	let currentQuestion = $derived(Math.ceil(round / 2));
	let totalQuestions = $derived(Math.ceil(totalRounds / 2));
	let questionTurn = $derived(((round - 1) % 2) + 1);
	let promptText = $derived(() => {
		const idx = Math.floor((round - 1) / 2);
		return $interviewState.prompts[idx] || 'Tell your partner about a time you had to figure something out where there wasn\'t a clear answer. Any context — work, school, personal. Don\'t pick the most impressive story. Pick what comes to mind first. 3-4 minutes.';
	});

	// Role determination
	let students = $derived($interviewState.students);
	let role = $derived($interviewState.role);
	let partnerName = $derived($interviewState.partnerName);
	let roomId = $derived($interviewState.roomId);

	// Interview phases: 'notes' | 'followup' | 'profile'
	let phase = $state('notes');
	let notesText = $state('');
	let followupText = $state('');
	let followupQuestions = $state([]);
	let profileData = $state(null);
	let customTags = $state([]);
	let customTagInput = $state('');

	// Loading states
	let submittingNotes = $state(false);
	let generatingQuestions = $state(false);
	let submittingFollowup = $state(false);
	let generatingProfile = $state(false);
	let profileVisible = $state(false);

	// Auto-save
	let debounceTimer = null;
	let autosaveVisible = $state(false);
	let autosaveLabel = $state('notes');

	// Storyteller polling
	let storytellerPollInterval = null;

	// Character counting
	let notesChars = $derived(notesText.length);
	let notesWords = $derived(notesText.trim() ? notesText.trim().split(/\s+/).length : 0);
	let notesRemaining = $derived(MIN_CHARS - notesChars);
	let followupChars = $derived(followupText.length);
	let followupWords = $derived(followupText.trim() ? followupText.trim().split(/\s+/).length : 0);
	let followupRemaining = $derived(MIN_CHARS - followupChars);

	// Round header
	let headerTitle = $derived(`Question ${currentQuestion} of ${totalQuestions} · Turn ${questionTurn} of 2`);
	let headerRoles = $derived(() => {
		const sorted = [...students].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
		const iIdx = round % 2 === 1 ? 0 : 1;
		const sIdx = round % 2 === 1 ? 1 : 0;
		return `${sorted[iIdx]} interviews ${sorted[sIdx]}`;
	});

	let nextButtonText = $derived(() => {
		if (round >= totalRounds) return 'Finish Workshop';
		if (questionTurn === 1) return 'Switch Roles';
		return `Continue to Question ${currentQuestion + 1}`;
	});

	function debouncedSave(text, roundLabel) {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			if (!text.trim()) return;
			api('workshop-submit', {
				body: {
					sessionId: $interviewState.sessionId,
					roomId,
					studentName: $interviewState.studentName,
					aboutStudent: partnerName,
					notes: text.trim(),
					round: roundLabel
				}
			}).then(() => {
				autosaveVisible = true;
				setTimeout(() => (autosaveVisible = false), 2000);
			}).catch(() => {});
		}, CFG.debounce_save_ms);
	}

	function handleNotesInput() {
		autosaveLabel = 'notes';
		debouncedSave(notesText, `round${round}-notes`);
	}

	async function handleSubmitNotes() {
		if (!notesText.trim() || notesText.length < MIN_CHARS) return;
		submittingNotes = true;
		try {
			await api('workshop-submit', {
				body: {
					sessionId: $interviewState.sessionId,
					roomId,
					studentName: $interviewState.studentName,
					aboutStudent: partnerName,
					notes: notesText.trim(),
					round: `round${round}-notes`
				}
			});
			const data = await api('workshop-followup', {
				body: { sessionId: $interviewState.sessionId, roomId, notes: notesText.trim() }
			});
			followupQuestions = data.questions || data.followups || [];
			phase = 'followup';
		} catch (err) {
			alert('Error submitting notes: ' + err.message);
		} finally {
			submittingNotes = false;
		}
	}

	async function handleMoreQuestions() {
		const combined = followupText.trim()
			? `${notesText.trim()}\n\nFollow-up notes:\n${followupText.trim()}`
			: notesText.trim();
		if (!combined) return;
		generatingQuestions = true;
		try {
			const data = await api('workshop-followup', {
				body: { sessionId: $interviewState.sessionId, roomId, notes: combined, regenerate: true }
			});
			followupQuestions = data.questions || data.followups || [];
		} catch (err) {
			alert('Error generating questions: ' + err.message);
		} finally {
			generatingQuestions = false;
		}
	}

	function handleFollowupInput() {
		autosaveLabel = 'followup';
		debouncedSave(followupText, `round${round}-followup`);
	}

	async function handleSubmitFollowup() {
		if (!followupText.trim() || followupText.length < MIN_CHARS) return;
		submittingFollowup = true;
		try {
			await api('workshop-submit', {
				body: {
					sessionId: $interviewState.sessionId,
					roomId,
					studentName: $interviewState.studentName,
					aboutStudent: partnerName,
					notes: followupText.trim(),
					round: `round${round}-followup`
				}
			});
			phase = 'profile';
		} catch (err) {
			alert('Error submitting follow-up: ' + err.message);
		} finally {
			submittingFollowup = false;
		}
	}

	async function handleEndRound() {
		generatingProfile = true;
		try {
			const data = await api('workshop-profile', {
				body: { sessionId: $interviewState.sessionId, roomId, studentName: partnerName, round }
			});
			const profile = data.profile || data;
			profileData = {
				summary: profile.summary || 'Profile generated.',
				capabilities: profile.capabilities || []
			};
			setTimeout(() => (profileVisible = true), 50);
		} catch (err) {
			alert('Error generating profile: ' + err.message);
		} finally {
			generatingProfile = false;
		}
	}

	function handleAddTag() {
		const tag = customTagInput.trim();
		if (!tag) return;
		customTags = [...customTags, tag];
		customTagInput = '';
	}

	function handleNextRound() {
		if (round >= totalRounds) {
			onComplete();
			return;
		}
		// Reset for next round
		phase = 'notes';
		notesText = '';
		followupText = '';
		followupQuestions = [];
		profileData = null;
		profileVisible = false;
		customTags = [];

		interviewState.update((s) => {
			const newRound = s.round + 1;
			const sorted = [...s.students].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
			const iIdx = newRound % 2 === 1 ? 0 : 1;
			const sIdx = newRound % 2 === 1 ? 1 : 0;
			return {
				...s,
				round: newRound,
				role: sorted[iIdx] === s.studentName ? 'interviewer' : 'storyteller',
				partnerName: sorted[iIdx] === s.studentName ? sorted[sIdx] : sorted[iIdx]
			};
		});
	}

	// Storyteller: poll for round advancement
	function startStorytellerPoll() {
		if (storytellerPollInterval) clearInterval(storytellerPollInterval);
		storytellerPollInterval = setInterval(async () => {
			try {
				const data = await api('workshop-room', {
					params: { sessionId: $interviewState.sessionId, roomId }
				});
				const room = data.room || data;
				const currentRound = room.currentRound || room.round;
				if (currentRound && currentRound > $interviewState.round) {
					clearInterval(storytellerPollInterval);
					storytellerPollInterval = null;
					// Reset local phase
					phase = 'notes';
					notesText = '';
					followupText = '';
					followupQuestions = [];
					profileData = null;
					profileVisible = false;
					customTags = [];

					interviewState.update((s) => {
						const sorted = [...s.students].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
						const iIdx = currentRound % 2 === 1 ? 0 : 1;
						const sIdx = currentRound % 2 === 1 ? 1 : 0;
						return {
							...s,
							round: currentRound,
							role: sorted[iIdx] === s.studentName ? 'interviewer' : 'storyteller',
							partnerName: sorted[iIdx] === s.studentName ? sorted[sIdx] : sorted[iIdx]
						};
					});
				}
				if (data.ended || currentRound > $interviewState.totalRounds) {
					clearInterval(storytellerPollInterval);
					storytellerPollInterval = null;
					onComplete();
				}
			} catch {}
		}, 5000);
	}

	$effect(() => {
		if (role === 'storyteller') {
			startStorytellerPoll();
		}
		return () => {
			if (storytellerPollInterval) {
				clearInterval(storytellerPollInterval);
				storytellerPollInterval = null;
			}
		};
	});

	onDestroy(() => {
		clearTimeout(debounceTimer);
		if (storytellerPollInterval) clearInterval(storytellerPollInterval);
	});
</script>

<div class="ws-round-header">
	<div class="ws-round-header__left">
		<h2>{headerTitle}</h2>
		<p>{headerRoles()}</p>
	</div>
	<div class="ws-round-header__badge">Room {roomId}</div>
</div>

<div class="ws-prompt-card">
	<p>{promptText()}</p>
</div>

{#if role === 'interviewer'}
	<span class="ws-role-label ws-role-label--interviewer">You are the interviewer</span>

	{#if phase === 'notes'}
		<div class="ws-field">
			<label class="ws-label" for="notes-textarea">Capture what your partner shares</label>
			<textarea
				id="notes-textarea"
				class="ws-textarea"
				placeholder="Listen carefully and write down what they did, how they approached it, and what happened..."
				bind:value={notesText}
				oninput={handleNotesInput}
			></textarea>
			<div class="ws-textarea-footer">
				<div class="ws-autosave" class:ws-autosave--visible={autosaveVisible && autosaveLabel === 'notes'}>Auto-saved</div>
				<div class="ws-char-counter" class:ws-char-counter--short={notesRemaining > 0}>
					{#if notesRemaining > 0}
						{notesChars} / {MIN_CHARS} characters · {notesWords} words — {notesRemaining} more needed
					{:else}
						{notesChars} characters · {notesWords} words
					{/if}
				</div>
			</div>
		</div>
		<div class="ws-btn-row">
			<button class="ws-btn" onclick={handleSubmitNotes} disabled={submittingNotes}>
				{submittingNotes ? 'Submitting...' : 'Submit Notes'}
			</button>
		</div>
	{/if}

	{#if phase === 'followup'}
		<h3 style="margin:0 0 8px;font-size:17px;color:var(--ci-accent);">Follow-up questions to dig deeper</h3>
		<div class="ws-followup-cards">
			{#each followupQuestions as q, i}
				<div class="ws-followup-card ws-followup-card--visible" style="animation-delay: {100 + i * 150}ms">
					{typeof q === 'string' ? q : q.question || q.text || ''}
				</div>
			{/each}
		</div>
		<div class="ws-btn-row" style="margin-top:10px;">
			<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={handleMoreQuestions} disabled={generatingQuestions}>
				{generatingQuestions ? 'Generating...' : 'Generate More Questions'}
			</button>
		</div>
		<div class="ws-field" style="margin-top:16px;">
			<label class="ws-label" for="followup-textarea">Follow-up notes</label>
			<textarea
				id="followup-textarea"
				class="ws-textarea"
				placeholder="Capture their answers to the follow-up questions..."
				bind:value={followupText}
				oninput={handleFollowupInput}
			></textarea>
			<div class="ws-textarea-footer">
				<div class="ws-autosave" class:ws-autosave--visible={autosaveVisible && autosaveLabel === 'followup'}>Auto-saved</div>
				<div class="ws-char-counter" class:ws-char-counter--short={followupRemaining > 0}>
					{#if followupRemaining > 0}
						{followupChars} / {MIN_CHARS} characters · {followupWords} words — {followupRemaining} more needed
					{:else}
						{followupChars} characters · {followupWords} words
					{/if}
				</div>
			</div>
		</div>
		<div class="ws-btn-row">
			<button class="ws-btn" onclick={handleSubmitFollowup} disabled={submittingFollowup}>
				{submittingFollowup ? 'Submitting...' : 'Submit Follow-up Notes'}
			</button>
		</div>
	{/if}

	{#if phase === 'profile'}
		{#if !profileData}
			<div class="ws-btn-row" style="margin-bottom:16px;">
				<button class="ws-btn" onclick={handleEndRound} disabled={generatingProfile}>
					{generatingProfile ? 'Generating...' : 'End Round & Generate Profile'}
				</button>
			</div>
			{#if generatingProfile}
				<WaitingDots />
			{/if}
		{:else}
			<div class="ws-profile-card" class:ws-profile-card--visible={profileVisible}>
				<h3>Capability Profile</h3>
				<p>{profileData.summary}</p>
				<div class="ws-capability-tags">
					{#each profileData.capabilities as cap}
						{@const name = typeof cap === 'string' ? cap : cap.capability || cap.name || ''}
						{@const evidence = typeof cap === 'object' ? (cap.evidence || '') : ''}
						<div class="ws-capability-tag">
							<strong>{name}</strong>
							{#if evidence}<br><span style="font-size:13px;color:var(--ci-text-muted)">{evidence}</span>{/if}
						</div>
					{/each}
					{#each customTags as tag}
						<span class="ws-capability-tag ws-capability-tag--custom">{tag}</span>
					{/each}
				</div>
				<div class="ws-add-tag-row">
					<input
						class="ws-input"
						type="text"
						placeholder="Add a capability tag..."
						bind:value={customTagInput}
						onkeydown={(e) => e.key === 'Enter' && handleAddTag()}
					>
					<button class="ws-btn ws-btn--small ws-btn--secondary" onclick={handleAddTag}>Add</button>
				</div>
			</div>
			<div style="margin-top:20px;">
				<button class="ws-btn" onclick={handleNextRound}>{nextButtonText()}</button>
			</div>
		{/if}
	{/if}
{:else}
	<span class="ws-role-label ws-role-label--storyteller">You are the storyteller</span>
	<div class="ws-storyteller-message">
		<p>Share your story with your partner. They are taking notes.<br>Take your time — 3-4 minutes is the goal.</p>
	</div>
{/if}

<div class="ws-btn-row" style="justify-content:center;margin-top:24px;">
	<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onChangeRoom}>Change Room</button>
</div>
