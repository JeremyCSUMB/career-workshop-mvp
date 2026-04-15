<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api.js';
	import { WORKSHOP_CONFIG as CFG } from '$lib/config.js';
	import { interviewState } from '$lib/stores/interview.js';
	import NudgeBanner from '$lib/components/NudgeBanner.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import EntryScreen from '$lib/components/interview/EntryScreen.svelte';
	import RoomPicker from '$lib/components/interview/RoomPicker.svelte';
	import WaitingScreen from '$lib/components/interview/WaitingScreen.svelte';
	import InterviewScreen from '$lib/components/interview/InterviewScreen.svelte';
	import CompleteScreen from '$lib/components/interview/CompleteScreen.svelte';
	import PartnerChangeScreen from '$lib/components/interview/PartnerChangeScreen.svelte';
	import UserProfileMenu from '$lib/components/UserProfileMenu.svelte';
	import { fade, fly } from 'svelte/transition';

	let { data } = $props();

	let screen = $state('entry'); // entry | rooms | waiting | interview | complete | ended
	let rooms = $state([]);
	let codeFromUrl = $state(false);
	let sessionEndedMessage = $state('');
	let claimState = $state(null); // { roomId, students } when a 409 with names is received
	let resumeRoomData = $state(null); // { aiFollowUps, capabilityProfiles } from server on resume
	let rejoined = $state(false); // true when resuming via workshop-join with rejoined: true

	// Nudge state
	let nudgeText = $state('');
	let nudgeVisible = $state(false);
	let lastNudgeTimestamp = $state('');
	let nudgeDismissTimer = null;

	// Polling intervals
	let heartbeatInterval = null;
	let nudgeInterval = null;
	let waitingPollInterval = null;

	// Bottom nav items (visible when in session)
	let navItems = $derived(
		['entry', 'rooms'].includes(screen) ? [] : [
			{ id: 'home', label: 'Home', icon: '\u2302', onclick: () => navTo('home') },
			{ id: 'interview', label: 'Interview', icon: '\u270E', onclick: () => navTo('interview') },
			{ id: 'profile', label: 'Profile', icon: '\u2605', onclick: () => navTo('profile') }
		]
	);

	let activeNav = $derived(
		screen === 'waiting' ? 'home' :
		screen === 'interview' ? 'interview' :
		screen === 'complete' ? 'profile' : 'home'
	);

	function navTo(target) {
		if (target === 'home') {
			if ($interviewState.students.length >= 2) goToScreen('interview');
			else if ($interviewState.roomId) goToScreen('waiting');
			else goToScreen('rooms');
		} else if (target === 'interview' && (screen === 'interview' || screen === 'waiting')) {
			goToScreen(screen);
		} else if (target === 'profile' && screen === 'complete') {
			goToScreen('complete');
		}
	}

	function goToScreen(name) {
		screen = name;
		interviewState.update((s) => ({ ...s, phase: name }));

		if (name === 'entry') stopAllPolling();
	}

	// Heartbeat
	function startHeartbeat() {
		if (heartbeatInterval) return;
		const beat = () => {
			if (!$interviewState.sessionId || !$interviewState.roomId) return;
			api('workshop-heartbeat', {
				body: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId, studentName: $interviewState.studentName }
			}).catch(() => {});
		};
		beat();
		heartbeatInterval = setInterval(beat, CFG.heartbeat_interval);
	}

	// Nudge polling
	function startNudgePolling() {
		if (nudgeInterval) return;
		const poll = async () => {
			if (!$interviewState.sessionId || !$interviewState.roomId) return;
			try {
				const data = await api('workshop-nudge', {
					params: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId, since: lastNudgeTimestamp }
				});
				if (data.nudges && data.nudges.length > 0) {
					lastNudgeTimestamp = data.nudges[data.nudges.length - 1].timestamp;
					nudgeText = data.nudges[data.nudges.length - 1].message;
					nudgeVisible = true;
					clearTimeout(nudgeDismissTimer);
					nudgeDismissTimer = setTimeout(() => (nudgeVisible = false), 30000);
				}
			} catch {}
		};
		nudgeInterval = setInterval(poll, CFG.nudge_poll_interval);
	}

	// Waiting poll
	function startWaitingPoll() {
		if (waitingPollInterval) clearInterval(waitingPollInterval);
		const poll = async () => {
			try {
				const data = await api('workshop-room', {
					params: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId }
				});
				const room = data.room || data;
				const students = extractStudentNames(room.students);
				interviewState.update((s) => ({ ...s, students }));

				if (students.length >= 2) {
					clearInterval(waitingPollInterval);
					waitingPollInterval = null;
					setTimeout(() => startInterview(), 1500);
				}
			} catch {}
		};
		poll();
		waitingPollInterval = setInterval(poll, 3000);
	}

	function extractStudentNames(studentsObj) {
		if (!studentsObj) return [];
		if (Array.isArray(studentsObj)) return studentsObj;
		return Object.values(studentsObj).filter(Boolean);
	}

	function determineRoles(students, round) {
		const sorted = [...students].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
		const iIdx = round % 2 === 1 ? 0 : 1;
		const sIdx = round % 2 === 1 ? 1 : 0;
		return { interviewer: sorted[iIdx], storyteller: sorted[sIdx] };
	}

	function startInterview() {
		const roles = determineRoles($interviewState.students, $interviewState.round);
		const myRole = roles.interviewer === $interviewState.studentName ? 'interviewer' : 'storyteller';
		const partner = myRole === 'interviewer' ? roles.storyteller : roles.interviewer;
		interviewState.update((s) => ({ ...s, role: myRole, partnerName: partner }));
		goToScreen('interview');
	}

	function clearEphemeralKeys() {
		localStorage.removeItem('ws_interviewPhase');
		localStorage.removeItem('ws_notesText');
		localStorage.removeItem('ws_followupText');
	}

	function stopAllPolling() {
		if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
		if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
		if (waitingPollInterval) { clearInterval(waitingPollInterval); waitingPollInterval = null; }
		lastNudgeTimestamp = '';
	}

	// Event handlers from child components
	function handleRoomsFound(roomList) {
		rooms = roomList;
		goToScreen('rooms');
	}

	async function handleClaimSlot(roomId, slot) {
		claimState = null;
		await handleJoinRoom(roomId, slot);
	}

	async function handleJoinRoom(roomId, claimSlot) {
		try {
			const joinBody = { sessionId: $interviewState.sessionId, roomId: String(roomId), studentName: $interviewState.studentName };
			if (claimSlot) joinBody.claimSlot = claimSlot;
			const data = await api('workshop-join', { body: joinBody });
			const room = data.room || data;

			interviewState.update((s) => ({ ...s, roomId: String(roomId) }));

			if (data.rejoined) {
				rejoined = true;
				const currentRound = room.currentRound || 1;
				if (currentRound > $interviewState.totalRounds) {
					interviewState.update((s) => ({ ...s, round: s.totalRounds }));
					startHeartbeat();
					startNudgePolling();
					goToScreen('complete');
					return;
				}
				interviewState.update((s) => ({ ...s, round: currentRound }));
			}

			startHeartbeat();
			startNudgePolling();

			const students = extractStudentNames(room.students);
			interviewState.update((s) => ({ ...s, students }));
			if (students.length >= 2) {
				startInterview();
			} else {
				goToScreen('waiting');
				startWaitingPoll();
			}
		} catch (err) {
			if (err.message && err.message.includes('session has ended')) {
				clearEphemeralKeys();
				sessionEndedMessage = 'This session has ended. You can no longer join.';
				goToScreen('ended');
			} else if (err.status === 409 && err.data?.students) {
				claimState = { roomId: String(roomId), students: err.data.students };
			} else {
				alert(err.message);
			}
		}
	}

	async function handleChangeRoom() {
		stopAllPolling();
		clearEphemeralKeys();
		try {
			await api('workshop-leave', {
				body: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId, studentName: $interviewState.studentName }
			});
		} catch {}
		interviewState.update((s) => ({ ...s, roomId: '', round: 1, students: [], role: null, partnerName: '' }));
		try {
			const data = await api('workshop-rooms', { params: { sessionId: $interviewState.sessionId } });
			rooms = data.rooms || [];
			goToScreen('rooms');
		} catch {
			goToScreen('entry');
		}
	}

	function handleMoved({ newRoomId, newRoom }) {
		// Stop existing polls — new room means new heartbeat target
		stopAllPolling();
		clearEphemeralKeys();

		// Extract students from the new room
		const students = extractStudentNames(newRoom.students);
		const newRound = newRoom.currentRound || 1;

		// Update store with new room info
		interviewState.update((s) => ({
			...s,
			roomId: newRoomId,
			round: newRound,
			students,
			role: null,
			partnerName: ''
		}));

		// Store new room data for the partner change screen
		resumeRoomData = null;

		// Restart heartbeat for the new room
		startHeartbeat();
		startNudgePolling();

		// Transition to partner-change screen (US-012 will implement the actual component)
		goToScreen('partner-change');
	}

	function handleNewPartner({ newRoom, newPartnerName }) {
		// Existing student: a new partner was moved into their room
		stopAllPolling();
		clearEphemeralKeys();

		const students = extractStudentNames(newRoom.students);
		const newRound = newRoom.currentRound || $interviewState.round;

		// Update store with refreshed room data
		interviewState.update((s) => ({
			...s,
			round: newRound,
			students,
			role: null,
			partnerName: ''
		}));

		resumeRoomData = null;

		// Restart heartbeat for the same room
		startHeartbeat();
		startNudgePolling();

		// Transition to partner-change screen with 'existing' variant
		goToScreen('partner-change-existing');
	}

	function handlePartnerChangeReady() {
		// Re-determine roles with the new pair and start the interview fresh
		startInterview();
	}

	function handleComplete() {
		goToScreen('complete');
	}

	function handleSwitchSession() {
		if ($interviewState.sessionId && $interviewState.roomId) {
			api('workshop-leave', {
				body: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId, studentName: $interviewState.studentName }
			}).catch(() => {});
		}
		stopAllPolling();
		clearEphemeralKeys();
		const savedName = $interviewState.studentName;
		interviewState.reset();
		codeFromUrl = false;
		interviewState.update((s) => ({ ...s, studentName: savedName }));
		if (savedName) localStorage.setItem('ws_studentName', savedName);
		goToScreen('entry');
	}

	function handleLeave() {
		stopAllPolling();
		clearEphemeralKeys();
		interviewState.reset();
		codeFromUrl = false;
		goToScreen('entry');
	}

	// Resume on mount
	onMount(() => {
		// Auto-fill student name from Google profile
		if (data?.user?.name && !$interviewState.studentName) {
			interviewState.update((s) => ({ ...s, studentName: data.user.name }));
		}

		// Check for ?code= URL parameter
		const urlParams = new URLSearchParams(window.location.search);
		const codeParam = urlParams.get('code');
		if (codeParam) {
			interviewState.update((s) => ({ ...s, sessionId: codeParam }));
			codeFromUrl = true;
			window.history.replaceState({}, '', window.location.pathname);

			// Auto-submit if we already have a name
			if ($interviewState.studentName) {
				handleRoomsFound([]); // Will trigger find rooms
				api('workshop-rooms', { params: { sessionId: codeParam } }).then((data) => {
					if (data.ended) {
						clearEphemeralKeys();
						sessionEndedMessage = 'This session has ended.';
						goToScreen('ended');
						return;
					}
					if (data.rounds) interviewState.update((s) => ({ ...s, totalRounds: data.rounds, prompts: data.prompts || s.prompts }));
					rooms = data.rooms || [];
					if (rooms.length > 0) goToScreen('rooms');
				}).catch(() => {});
				return;
			}
		}

		// Resume from localStorage
		const s = $interviewState;
		if (!s.sessionId || !s.studentName) {
			// No stored session — clear any stale partial state and show entry
			if (s.sessionId || s.roomId || s.studentName) interviewState.reset();
			goToScreen('entry');
			return;
		}

		// Validate stored session is still active on the server before resuming
		api('workshop-rooms', { params: { sessionId: s.sessionId } }).then((validationData) => {
			if (validationData.ended) {
				clearEphemeralKeys();
				interviewState.reset();
				sessionEndedMessage = 'Your previous session has ended.';
				goToScreen('ended');
				return;
			}

			// Session is valid — proceed with resume
			if (!s.roomId) {
				// Have session but no room yet — show room picker with fresh data
				if (validationData.rounds) interviewState.update((st) => ({ ...st, totalRounds: validationData.rounds, prompts: validationData.prompts || st.prompts }));
				rooms = validationData.rooms || [];
				goToScreen('rooms');
				return;
			}

			startHeartbeat();
			startNudgePolling();

			if (s.phase === 'complete') {
				goToScreen('complete');
				return;
			}

			if (s.phase === 'interview' || s.phase === 'waiting') {
				// Re-register via workshop-join first, then fetch full data via workshop-room
				api('workshop-join', {
					body: { sessionId: s.sessionId, roomId: s.roomId, studentName: s.studentName }
				}).then(async (joinData) => {
					const joinRoom = joinData.room || joinData;
					const currentRound = joinRoom.currentRound || 1;

					if (currentRound > $interviewState.totalRounds) {
						interviewState.update((st) => ({ ...st, round: st.totalRounds }));
						goToScreen('complete');
						return;
					}

					if (joinData.rejoined) rejoined = true;

					// Fetch full room state (includes submissions, aiFollowUps, capabilityProfiles)
					const roomData = await api('workshop-room', {
						params: { sessionId: s.sessionId, roomId: s.roomId }
					});

					if (roomData.ended) {
						stopAllPolling();
						clearEphemeralKeys();
						sessionEndedMessage = 'This session has ended.';
						goToScreen('ended');
						return;
					}

					const room = roomData.room || roomData;
					const students = extractStudentNames(room.students);
					const resumeRound = Math.min(currentRound, $interviewState.totalRounds);
					interviewState.update((st) => ({ ...st, students, round: resumeRound }));

					// Store server data for InterviewScreen to restore followup/profile/notes state
					resumeRoomData = {
						aiFollowUps: room.aiFollowUps || [],
						capabilityProfiles: room.capabilityProfiles || [],
						submissions: room.submissions || []
					};

					if (students.length >= 2) {
						startInterview();
					} else {
						goToScreen('waiting');
						startWaitingPoll();
					}
				}).catch((err) => {
					if (err.message && err.message.includes('session has ended')) {
						stopAllPolling();
						clearEphemeralKeys();
						sessionEndedMessage = 'This session has ended.';
						goToScreen('ended');
					} else {
						goToScreen('entry');
					}
				});
				return;
			}

			if (s.phase === 'rooms') {
				if (validationData.rounds) interviewState.update((st) => ({ ...st, totalRounds: validationData.rounds, prompts: validationData.prompts || st.prompts }));
				rooms = validationData.rooms || [];
				goToScreen('rooms');
				return;
			}

			goToScreen('entry');
		}).catch(() => {
			// Session doesn't exist on the server — clear stale state and start fresh
			interviewState.reset();
			goToScreen('entry');
		});
	});

	async function handleProfileLogout() {
		try {
			await fetch('/.netlify/functions/auth-logout', { method: 'POST' });
		} catch {}
		// Clear ws_* localStorage keys
		Object.keys(localStorage).filter((k) => k.startsWith('ws_')).forEach((k) => localStorage.removeItem(k));
		window.location.href = '/login';
	}

	onDestroy(() => {
		stopAllPolling();
		clearTimeout(nudgeDismissTimer);
	});
</script>

<svelte:head>
	<title>Career Intelligence Workshop</title>
</svelte:head>

<NudgeBanner text={nudgeText} visible={nudgeVisible} onDismiss={() => (nudgeVisible = false)} />

<header class="ws-header" style="position:relative;">
	<h1>Career Intelligence Workshop</h1>
	<p>Peer interview — discover capabilities you didn't know you had.</p>
	{#if !['entry', 'rooms'].includes(screen)}
		<button class="ws-leave-btn" onclick={handleLeave}>Leave Session</button>
	{/if}
	{#if data?.user}
		<div class="ws-header__profile">
			<UserProfileMenu name={data.user.name} email={data.user.email} picture={data.user.picture} onLogout={handleProfileLogout} />
		</div>
	{/if}
</header>

<main class="ws-container">
	{#key screen}
		<div in:fly={{ y: 4, duration: 250 }} out:fade={{ duration: 150 }}>
			{#if screen === 'entry'}
				<EntryScreen onRoomsFound={handleRoomsFound} {codeFromUrl} googleName={data?.user?.name || ''} />
			{:else if screen === 'rooms'}
				<RoomPicker {rooms} onJoinRoom={handleJoinRoom} onSwitchSession={handleSwitchSession} {claimState} onClaimSlot={handleClaimSlot} onCancelClaim={() => (claimState = null)} />
			{:else if screen === 'waiting'}
				<WaitingScreen students={$interviewState.students} onChangeRoom={handleChangeRoom} />
			{:else if screen === 'interview'}
				<InterviewScreen onComplete={handleComplete} onChangeRoom={handleChangeRoom} onMoved={handleMoved} onNewPartner={handleNewPartner} {resumeRoomData} {rejoined} />
			{:else if screen === 'partner-change'}
				<PartnerChangeScreen onReady={handlePartnerChangeReady} variant="moved" />
			{:else if screen === 'partner-change-existing'}
				<PartnerChangeScreen onReady={handlePartnerChangeReady} variant="existing" />
			{:else if screen === 'complete'}
				<CompleteScreen onChangeRoom={handleChangeRoom} onSwitchSession={handleSwitchSession} onLeave={handleLeave} />
			{:else if screen === 'ended'}
				<div class="ws-card" style="text-align:center;padding:40px 24px;">
					<div style="font-size:48px;margin-bottom:16px;">&#128683;</div>
					<h2 style="margin:0 0 8px;">Session Ended</h2>
					<p style="color:var(--ci-text-muted);margin:0 0 24px;">{sessionEndedMessage}</p>
					<button class="ws-btn" onclick={handleSwitchSession}>Join a Different Session</button>
				</div>
			{/if}
		</div>
	{/key}
</main>

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
