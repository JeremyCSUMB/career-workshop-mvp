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
	import { fade, fly } from 'svelte/transition';

	let screen = $state('entry'); // entry | rooms | waiting | interview | complete
	let rooms = $state([]);
	let codeFromUrl = $state(false);

	// Nudge state
	let nudgeText = $state('');
	let nudgeVisible = $state(false);
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
				body: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId }
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
					params: { sessionId: $interviewState.sessionId, roomId: $interviewState.roomId }
				});
				if (data.nudges && data.nudges.length > 0) {
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

	function stopAllPolling() {
		if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
		if (nudgeInterval) { clearInterval(nudgeInterval); nudgeInterval = null; }
		if (waitingPollInterval) { clearInterval(waitingPollInterval); waitingPollInterval = null; }
	}

	// Event handlers from child components
	function handleRoomsFound(roomList) {
		rooms = roomList;
		goToScreen('rooms');
	}

	async function handleJoinRoom(roomId) {
		try {
			const data = await api('workshop-join', {
				body: { sessionId: $interviewState.sessionId, roomId: String(roomId), studentName: $interviewState.studentName }
			});
			const room = data.room || data;

			interviewState.update((s) => ({ ...s, roomId: String(roomId) }));

			if (data.rejoined) {
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
			alert(err.message);
		}
	}

	async function handleChangeRoom() {
		stopAllPolling();
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
		const savedName = $interviewState.studentName;
		interviewState.reset();
		interviewState.update((s) => ({ ...s, studentName: savedName }));
		if (savedName) localStorage.setItem('ws_studentName', savedName);
		goToScreen('entry');
	}

	function handleLeave() {
		stopAllPolling();
		interviewState.reset();
		goToScreen('entry');
	}

	// Resume on mount
	onMount(() => {
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
					rooms = data.rooms || [];
					if (rooms.length > 0) goToScreen('rooms');
				}).catch(() => {});
				return;
			}
		}

		// Resume from localStorage
		const s = $interviewState;
		if (!s.sessionId || !s.roomId || !s.studentName) {
			goToScreen('entry');
			return;
		}

		startHeartbeat();
		startNudgePolling();

		if (s.phase === 'complete') {
			goToScreen('complete');
			return;
		}

		if (s.phase === 'interview' || s.phase === 'waiting') {
			api('workshop-room', {
				params: { sessionId: s.sessionId, roomId: s.roomId }
			}).then((data) => {
				const room = data.room || data;
				const students = extractStudentNames(room.students);
				interviewState.update((st) => ({ ...st, students }));
				if (students.length >= 2) {
					startInterview();
				} else {
					goToScreen('waiting');
					startWaitingPoll();
				}
			}).catch(() => goToScreen('entry'));
			return;
		}

		if (s.phase === 'rooms') {
			api('workshop-rooms', { params: { sessionId: s.sessionId } }).then((data) => {
				if (data.rounds) interviewState.update((st) => ({ ...st, totalRounds: data.rounds, prompts: data.prompts || st.prompts }));
				rooms = data.rooms || [];
				goToScreen('rooms');
			}).catch(() => goToScreen('entry'));
			return;
		}

		goToScreen('entry');
	});

	onDestroy(() => {
		stopAllPolling();
		clearTimeout(nudgeDismissTimer);
	});
</script>

<svelte:head>
	<title>Career Intelligence Workshop</title>
</svelte:head>

<NudgeBanner text={nudgeText} visible={nudgeVisible} onDismiss={() => (nudgeVisible = false)} />

<header class="ws-header">
	<h1>Career Intelligence Workshop</h1>
	<p>Peer interview — discover capabilities you didn't know you had.</p>
	{#if !['entry', 'rooms'].includes(screen)}
		<button class="ws-leave-btn" onclick={handleLeave}>Leave Session</button>
	{/if}
</header>

<main class="ws-container">
	{#key screen}
		<div in:fly={{ y: 4, duration: 250 }} out:fade={{ duration: 150 }}>
			{#if screen === 'entry'}
				<EntryScreen onRoomsFound={handleRoomsFound} {codeFromUrl} />
			{:else if screen === 'rooms'}
				<RoomPicker {rooms} onJoinRoom={handleJoinRoom} onSwitchSession={handleSwitchSession} />
			{:else if screen === 'waiting'}
				<WaitingScreen students={$interviewState.students} onChangeRoom={handleChangeRoom} />
			{:else if screen === 'interview'}
				<InterviewScreen onComplete={handleComplete} onChangeRoom={handleChangeRoom} />
			{:else if screen === 'complete'}
				<CompleteScreen onChangeRoom={handleChangeRoom} onSwitchSession={handleSwitchSession} onLeave={handleLeave} />
			{/if}
		</div>
	{/key}
</main>

<BottomNav items={navItems} active={activeNav} />
