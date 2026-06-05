<script>
	import { api } from '$lib/api.js';
	import { WORKSHOP_CONFIG as CFG } from '$lib/config.js';
	import { interviewState } from '$lib/stores/interview.js';
	import WaitingDots from '$lib/components/WaitingDots.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { findStudentSlot, questionForRound, rolesForRound, turnForRound } from '$lib/rooms.js';

	let { onComplete, onChangeRoom, onMoved = null, onNewPartner = null, resumeRoomData = null, rejoined = false } = $props();

	// Partner presence state
	let partnerOnline = $state(true); // assume online initially
	let partnerPreviousOnline = $state(null); // null = no previous state (initial load)
	let presencePollInterval = null;
	let showReconnectToast = $state(false);
	let showWelcomeBackToast = $state(false);
	let welcomeBackMessage = $state('');

	const MIN_CHARS = 80;

	// Derived state
	let round = $derived($interviewState.round);
	let totalRounds = $derived($interviewState.totalRounds);
	let roomSize = $derived($interviewState.roomSize || 2);
	let currentQuestion = $derived(questionForRound(round, roomSize));
	let totalQuestions = $derived(questionForRound(totalRounds, roomSize));
	let questionTurn = $derived(turnForRound(round, roomSize));
	let promptText = $derived(() => {
		const idx = Math.floor((round - 1) / roomSize);
		return $interviewState.prompts[idx] || 'Tell your partner about a time you had to figure something out where there wasn\'t a clear answer. Any context — work, school, personal. Don\'t pick the most impressive story. Pick what comes to mind first. 3-4 minutes.';
	});

	// Role determination
	let students = $derived($interviewState.students);
	let role = $derived($interviewState.role);
	let roles = $derived($interviewState.roles || rolesForRound(students, round, roomSize));
	let partnerName = $derived($interviewState.partnerName);
	let roomId = $derived($interviewState.roomId);
	let isPairRoom = $derived(roomSize === 2);
	let isNoteTaker = $derived(role === 'interviewer' || role === 'note-taker');
	let isAsker = $derived(role === 'interviewer' || role === 'asker');
	let isAnswerer = $derived(role === 'storyteller' || role === 'answerer');
	let answererName = $derived(roles?.answerer || partnerName);
	let askerName = $derived(roles?.asker || '');
	let noteTakerName = $derived(roles?.noteTaker || '');

	function draftKey(field, draftRound = round) {
		const sid = $interviewState.sessionId || 'unknown-session';
		const rid = roomId || 'unknown-room';
		const name = ($interviewState.studentName || 'unknown-student').toLowerCase().replace(/[^a-z0-9]+/g, '-');
		return `ws_draft_${sid}_${rid}_${name}_round${draftRound}_${field}`;
	}

	function draftMetaKey(field, draftRound = round) {
		return `${draftKey(field, draftRound)}_savedAt`;
	}

	function loadDraft(field) {
		if (!browser) return '';
		const scoped = localStorage.getItem(draftKey(field));
		if (scoped !== null) return scoped;
		const legacyKey = field === 'notes' ? 'ws_notesText' : 'ws_followupText';
		return localStorage.getItem(legacyKey) || '';
	}

	function clearDraftsForRound(doneRound = round) {
		if (!browser) return;
		localStorage.removeItem(draftKey('notes', doneRound));
		localStorage.removeItem(draftKey('followup', doneRound));
		localStorage.removeItem(draftKey('phase', doneRound));
		localStorage.removeItem(draftMetaKey('notes', doneRound));
		localStorage.removeItem(draftMetaKey('followup', doneRound));
		localStorage.removeItem('ws_notesText');
		localStorage.removeItem('ws_followupText');
	}

	// Interview phases: 'notes' | 'followup' | 'profile'
	let phase = $state(browser ? (localStorage.getItem(draftKey('phase')) || localStorage.getItem('ws_interviewPhase') || 'notes') : 'notes');
	let notesText = $state(loadDraft('notes'));
	let followupText = $state(loadDraft('followup'));
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
	let headerTitle = $derived(`Question ${currentQuestion} of ${totalQuestions} · Turn ${questionTurn} of ${roomSize}`);
	let headerRoles = $derived(() => {
		if (!roles) return '';
		if (isPairRoom) return `${roles.asker} interviews ${roles.answerer}`;
		return `${roles.asker} asks · ${roles.answerer} answers · ${roles.noteTaker} takes notes`;
	});

	let nextButtonText = $derived(() => {
		if (round >= totalRounds) return 'Finish Workshop';
		if (questionTurn < roomSize) return 'Switch Roles';
		return `Continue to Question ${currentQuestion + 1}`;
	});

	let resumeHydratedKey = '';

	$effect(() => {
		if (!browser || !resumeRoomData) return;
		const currentRound = $interviewState.round;
		const key = `${$interviewState.sessionId}:${roomId}:${$interviewState.studentName}:${currentRound}`;
		if (resumeHydratedKey === key) return;
		resumeHydratedKey = key;

		const submissions = resumeRoomData.submissions || [];
		const pickText = (field, serverSubmission) => {
			const localText = localStorage.getItem(draftKey(field, currentRound)) || '';
			const localSavedAt = Number(localStorage.getItem(draftMetaKey(field, currentRound)) || 0);
			const serverText = serverSubmission?.notes || '';
			const serverSavedAt = serverSubmission?.timestamp ? new Date(serverSubmission.timestamp).getTime() : 0;
			return localText && localSavedAt > serverSavedAt ? localText : serverText || localText;
		};

		const notesSubmission = submissions.find((s) => s.round === `round${currentRound}-notes` && s.studentName === $interviewState.studentName);
		const restoredNotes = pickText('notes', notesSubmission);
		if (restoredNotes) notesText = restoredNotes;

		const followupSubmission = submissions.find((s) => s.round === `round${currentRound}-followup` && s.studentName === $interviewState.studentName);
		const restoredFollowup = pickText('followup', followupSubmission);
		if (restoredFollowup) followupText = restoredFollowup;

		if (phase === 'followup') {
			const aiFollowUps = resumeRoomData.aiFollowUps || [];
			const roundEntry = aiFollowUps.find((f) => Number(f.round || 0) === currentRound) || aiFollowUps[aiFollowUps.length - 1];
			if (roundEntry?.questions?.length) {
				followupQuestions = roundEntry.questions;
			} else {
				phase = 'notes';
			}
		} else if (phase === 'profile') {
			const profiles = resumeRoomData.capabilityProfiles || [];
			const roundProfile = profiles.find((p) => Number(p.round) === currentRound && p.studentName === answererName);
			if (roundProfile) {
				profileData = {
					summary: roundProfile.summary || 'Profile generated.',
					capabilities: roundProfile.capabilities || []
				};
				profileVisible = true;
			} else {
				phase = 'notes';
			}
		}
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
					aboutStudent: answererName,
					role: isPairRoom ? 'interviewer' : 'note-taker',
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
					aboutStudent: answererName,
					role: isPairRoom ? 'interviewer' : 'note-taker',
					notes: notesText.trim(),
					round: `round${round}-notes`
				}
			});
			const data = await api('workshop-followup', {
				body: { sessionId: $interviewState.sessionId, roomId, notes: notesText.trim(), round, studentName: $interviewState.studentName, aboutStudent: answererName }
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
				body: { sessionId: $interviewState.sessionId, roomId, notes: combined, round, studentName: $interviewState.studentName, aboutStudent: answererName, regenerate: true }
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
					aboutStudent: answererName,
					role: isPairRoom ? 'interviewer' : 'note-taker',
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
				body: { sessionId: $interviewState.sessionId, roomId, studentName: answererName, round }
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
		// Clear persisted textarea content for the completed round
		clearDraftsForRound(round);
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
			const newRoles = rolesForRound(s.students, newRound, s.roomSize || 2);
			let newRole = 'answerer';
			if ((s.roomSize || 2) === 2) {
				newRole = newRoles?.noteTaker === s.studentName ? 'interviewer' : 'storyteller';
			} else if (newRoles?.noteTaker === s.studentName) {
				newRole = 'note-taker';
			} else if (newRoles?.asker === s.studentName) {
				newRole = 'asker';
			}
			return {
				...s,
				round: newRound,
				role: newRole,
				roles: newRoles,
				partnerName: newRoles?.answerer || ''
			};
		});
	}

	// Partner presence polling
	function updatePartnerPresence(room) {
		const presence = room.presence || {};
		const myName = $interviewState.studentName;
		const mySlot = findStudentSlot(room.students, myName, room.roomSize || roomSize);
		if (!mySlot) return;

		const otherSlots = Object.keys(room.students || {}).filter((slot) => slot !== mySlot && room.students[slot]);
		if (otherSlots.length === 0) return;
		const isOnline = otherSlots.every((slot) => {
			const p = presence[slot];
			return p?.lastSeen ? (Date.now() - new Date(p.lastSeen).getTime() <= CFG.presence_timeout) : false;
		});

		partnerPreviousOnline = partnerOnline;
		partnerOnline = isOnline;
	}

	// Detect if the student has been moved to a different room by the instructor
	async function checkForRoomMove(room) {
		const myName = $interviewState.studentName;
		if (!room.students) return false;

		// Check if student is still in this room
		const stillInRoom = !!findStudentSlot(room.students, myName, room.roomSize || roomSize);
		if (stillInRoom) return false;

		// Student is not in the room — check for movedTo marker
		const movedToInfo = Object.entries(room)
			.find(([key, value]) => key.endsWith('_movedTo') && value?.studentName === myName)?.[1] || null;

		if (!movedToInfo) return false;

		// Fetch the new room data
		try {
			const newRoomData = await api('workshop-room', {
				params: { sessionId: $interviewState.sessionId, roomId: movedToInfo.roomId }
			});
			const newRoom = newRoomData.room || newRoomData;

			if (onMoved) {
				onMoved({ newRoomId: movedToInfo.roomId, newRoom });
			}
			return true;
		} catch {
			return false;
		}
	}

	// Detect if a new partner has been moved into this room (existing student's perspective)
	function checkForNewPartner(room) {
		if (!room.students || !onNewPartner) return false;
		const myName = $interviewState.studentName;
		const currentPartner = $interviewState.partnerName;

		const roomNames = Object.values(room.students || {}).filter(Boolean);
		const knownNames = students;
		const newPartnerName = roomNames.find((name) => name !== myName && !knownNames.includes(name)) || null;

		// If there's no partner or partner hasn't changed, no move detected
		if (!newPartnerName || !currentPartner || newPartnerName === currentPartner) return false;

		// Partner name changed — verify via movedFrom marker or name mismatch
		const hasMovedFrom = Object.entries(room)
			.some(([key, value]) => key.endsWith('_movedFrom') && value?.studentName === newPartnerName);

		if (hasMovedFrom || newPartnerName !== currentPartner) {
			onNewPartner({ newRoom: room, newPartnerName });
			return true;
		}

		return false;
	}

	function startPresencePoll() {
		if (presencePollInterval) return;
		const poll = async () => {
			try {
				const data = await api('workshop-room', {
					params: { sessionId: $interviewState.sessionId, roomId }
				});
				const room = data.room || data;

				// Check if student was moved before updating presence
				const moved = await checkForRoomMove(room);
				if (moved) {
					clearInterval(presencePollInterval);
					presencePollInterval = null;
					return;
				}

				// Check if a new partner was moved into this room
				const newPartner = checkForNewPartner(room);
				if (newPartner) {
					clearInterval(presencePollInterval);
					presencePollInterval = null;
					return;
				}

				updatePartnerPresence(room);
			} catch {}
		};
		// Initial check after a short delay (don't flag on first load)
		setTimeout(poll, 5000);
		presencePollInterval = setInterval(poll, 5000);
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

				// Check if student was moved before processing round changes
				const moved = await checkForRoomMove(room);
				if (moved) {
					clearInterval(storytellerPollInterval);
					storytellerPollInterval = null;
					return;
				}

				// Check if a new partner was moved into this room
				const newPartner = checkForNewPartner(room);
				if (newPartner) {
					clearInterval(storytellerPollInterval);
					storytellerPollInterval = null;
					return;
				}

				// Update presence from the same poll
				updatePartnerPresence(room);

				if (isAsker) {
					const roundFollowup = (room.aiFollowUps || []).find((f) => Number(f.round || 0) === $interviewState.round);
					if (roundFollowup?.questions?.length) {
						followupQuestions = roundFollowup.questions;
					}
				}

				const currentRound = room.currentRound || room.round;
				if (currentRound && currentRound > $interviewState.round) {
					clearInterval(storytellerPollInterval);
					storytellerPollInterval = null;
					clearDraftsForRound($interviewState.round);
					// Reset local phase
					phase = 'notes';
					notesText = '';
					followupText = '';
					followupQuestions = [];
					profileData = null;
					profileVisible = false;
					customTags = [];

					interviewState.update((s) => {
						const newRoles = rolesForRound(s.students, currentRound, s.roomSize || 2);
						let newRole = 'answerer';
						if ((s.roomSize || 2) === 2) {
							newRole = newRoles?.noteTaker === s.studentName ? 'interviewer' : 'storyteller';
						} else if (newRoles?.noteTaker === s.studentName) {
							newRole = 'note-taker';
						} else if (newRoles?.asker === s.studentName) {
							newRole = 'asker';
						}
						return {
							...s,
							round: currentRound,
							role: newRole,
							roles: newRoles,
							partnerName: newRoles?.answerer || ''
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

	// Autosave via sendBeacon on beforeunload (tab close / navigate away)
	$effect(() => {
		if (!browser) return;
		const hasContent = notesText.trim().length > 0 || followupText.trim().length > 0;
		if (hasContent) {
			const handler = (/** @type {BeforeUnloadEvent} */ e) => {
				e.preventDefault();
				// Fire sendBeacon to save current text before page unloads
				const basePayload = {
					sessionId: $interviewState.sessionId,
					roomId,
					studentName: $interviewState.studentName,
					aboutStudent: answererName,
					role: isPairRoom ? 'interviewer' : 'note-taker'
				};
				if (notesText.trim()) {
					navigator.sendBeacon(
						`${CFG.api_base}/workshop-submit`,
						new Blob([JSON.stringify({ ...basePayload, notes: notesText.trim(), round: `round${round}-notes` })], { type: 'application/json' })
					);
				}
				if (followupText.trim() && phase === 'followup') {
					navigator.sendBeacon(
						`${CFG.api_base}/workshop-submit`,
						new Blob([JSON.stringify({ ...basePayload, notes: followupText.trim(), round: `round${round}-followup` })], { type: 'application/json' })
					);
				}
			};
			window.addEventListener('beforeunload', handler);
			return () => window.removeEventListener('beforeunload', handler);
		}
	});

	// Persist interview sub-phase to localStorage on every change
	$effect(() => {
		if (browser) {
			localStorage.setItem(draftKey('phase'), phase);
			localStorage.removeItem('ws_interviewPhase');
		}
	});

	// Persist textarea content to localStorage on every change
	$effect(() => {
		if (browser) {
			localStorage.setItem(draftKey('notes'), notesText);
			localStorage.setItem(draftMetaKey('notes'), String(Date.now()));
			localStorage.removeItem('ws_notesText');
		}
	});

	$effect(() => {
		if (browser) {
			localStorage.setItem(draftKey('followup'), followupText);
			localStorage.setItem(draftMetaKey('followup'), String(Date.now()));
			localStorage.removeItem('ws_followupText');
		}
	});

	// Show welcome-back toast on reconnection (rejoined session)
	$effect(() => {
		if (rejoined && role) {
			const roleLabel = role === 'interviewer' ? 'Interviewer' :
				role === 'storyteller' ? 'Storyteller' :
				role === 'asker' ? 'Asker' :
				role === 'note-taker' ? 'Note-taker' : 'Answerer';
			welcomeBackMessage = `Welcome back! You're in Round ${round} as ${roleLabel}.`;
			showWelcomeBackToast = true;
		}
	});

	// Show reconnection toast when partner transitions from offline to online
	$effect(() => {
		if (partnerPreviousOnline === false && partnerOnline === true) {
			showReconnectToast = true;
		}
	});

	$effect(() => {
	if (!isNoteTaker) {
			startStorytellerPoll();
		} else {
			// Note-taker/interviewer: start a separate presence poll (other roles get presence from their own poll)
			startPresencePoll();
		}
		return () => {
			if (storytellerPollInterval) {
				clearInterval(storytellerPollInterval);
				storytellerPollInterval = null;
			}
			if (presencePollInterval) {
				clearInterval(presencePollInterval);
				presencePollInterval = null;
			}
		};
	});

	onDestroy(() => {
		clearTimeout(debounceTimer);
		if (storytellerPollInterval) clearInterval(storytellerPollInterval);
		if (presencePollInterval) clearInterval(presencePollInterval);
	});
</script>

<div class="ws-round-header">
	<div class="ws-round-header__left">
		<h2>{headerTitle}</h2>
		<p>{headerRoles()}</p>
	</div>
	<div class="ws-round-header__badge">Room {roomId}</div>
</div>

{#if !partnerOnline && partnerPreviousOnline !== null}
	<div class="ws-partner-disconnected-banner" role="alert">
		Your partner appears to be disconnected. You can continue working &mdash; they'll be able to rejoin.
	</div>
{/if}

<div class="ws-prompt-card">
	<p>{promptText()}</p>
</div>

{#if isNoteTaker}
	<span class="ws-role-label ws-role-label--interviewer">{isPairRoom ? 'You are the interviewer' : 'You are the note-taker'}</span>

	{#if phase === 'notes'}
		<div class="ws-field">
			<label class="ws-label" for="notes-textarea">Capture what {answererName} shares</label>
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
{:else if isAsker}
	<span class="ws-role-label ws-role-label--interviewer">{isPairRoom ? 'You are the interviewer' : 'You are the asker'}</span>
	<div class="ws-storyteller-message">
		<p>Ask {answererName} the prompt and keep the conversation moving.</p>
	</div>
	{#if followupQuestions.length > 0}
		<h3 style="margin:18px 0 8px;font-size:17px;color:var(--ci-accent);">Follow-up questions to ask</h3>
		<div class="ws-followup-cards">
			{#each followupQuestions as q, i}
				<div class="ws-followup-card ws-followup-card--visible" style="animation-delay: {100 + i * 150}ms">
					{typeof q === 'string' ? q : q.question || q.text || ''}
				</div>
			{/each}
		</div>
	{:else}
		<div class="ws-storyteller-message">
			<p>Follow-up questions will appear here after {noteTakerName || 'the note-taker'} submits the first notes.</p>
		</div>
	{/if}
{:else}
	<span class="ws-role-label ws-role-label--storyteller">{isPairRoom ? 'You are the storyteller' : 'You are the answerer'}</span>
	<div class="ws-storyteller-message">
		<p>Share your story with {askerName || 'your room'}. {noteTakerName || 'Your note-taker'} is taking notes.<br>Take your time — 3-4 minutes is the goal.</p>
	</div>
{/if}

<div class="ws-btn-row" style="justify-content:center;margin-top:24px;">
	<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onChangeRoom}>Change Room</button>
</div>

<Toast bind:visible={showReconnectToast} message="Your partner is back online!" type="success" duration={5000} />
<Toast bind:visible={showWelcomeBackToast} message={welcomeBackMessage} type="info" duration={5000} />
