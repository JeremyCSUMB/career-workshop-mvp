<script>
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api.js';
	import { WORKSHOP_CONFIG as CFG } from '$lib/config.js';
	import OverviewBar from './OverviewBar.svelte';
	import RoomCard from './RoomCard.svelte';
	import NudgeModal from './NudgeModal.svelte';
	import MoveStudentModal from './MoveStudentModal.svelte';

	let { sessionId, onBackToSessions, onProjector } = $props();

	let rooms = $state([]);
	let totalRounds = $state(0);
	let lastPulse = {};
	let dirtyRooms = new Set();
	let lastClassifyTimestamps = {};
	let liveConnected = $state(true);

	// Nudge modal state
	let nudgeVisible = $state(false);
	let nudgeRoomId = $state('');
	let nudgeSuggested = $state('');

	// Move student modal state
	let moveVisible = $state(false);
	let moveStudentName = $state('');
	let moveFromRoomId = $state('');

	// Polling intervals
	let pulseInterval;
	let fullRefreshInterval;
	let classifyInterval;
	let inactivityInterval;

	// Room data helpers
	function extractStudentNames(studentsObj) {
		if (!studentsObj) return [];
		if (Array.isArray(studentsObj)) return studentsObj;
		return Object.values(studentsObj).filter(Boolean);
	}

	function getRoomStatus(room) {
		const classifications = room.classifications || [];
		if (classifications.length === 0) return { status: '', reasoning: '', suggestedNudge: null };
		const latest = classifications[classifications.length - 1];
		return {
			status: (latest.status || '').toLowerCase(),
			reasoning: latest.reasoning || '',
			suggestedNudge: latest.suggestedNudge || null
		};
	}

	function getRoomWordCount(room) {
		return (room.submissions || []).reduce((sum, s) => sum + (s.wordCount || 0), 0);
	}

	function getLatestNotes(room) {
		const subs = room.submissions || [];
		if (subs.length === 0) return '';
		return subs[subs.length - 1].notes || '';
	}

	function getSubmissionSummaries(room) {
		const subs = room.submissions || [];
		if (subs.length === 0) return [];
		return subs.map(s => {
			const isFollowup = (s.round || '').includes('-followup');
			const label = isFollowup ? 'Follow-up' : 'Notes';
			const about = s.aboutStudent ? ` about ${s.aboutStudent}` : '';
			return {
				label: `${s.studentName}${about} · ${label}`,
				notes: s.notes || '',
				wordCount: s.wordCount || 0,
			};
		});
	}

	function getRoomPhase(room) {
		const subs = room.submissions || [];
		const currentRound = room.currentRound || 1;
		if (subs.length === 0) return 'waiting';
		const roundPrefix = `round${currentRound}`;
		const hasFollowupSub = subs.some(s => (s.round || '') === `${roundPrefix}-followup`);
		if (hasFollowupSub) return 'profile';
		// AI follow-up questions are generated only after formal notes submission
		const followups = room.aiFollowUps || [];
		if (followups.length >= currentRound) return 'follow-up';
		const hasNotes = subs.some(s => (s.round || '') === `${roundPrefix}-notes`);
		if (hasNotes) return 'notes';
		return 'waiting';
	}

	function enrichRoom(room) {
		const cls = getRoomStatus(room);
		room._status = cls.status;
		room._reasoning = cls.reasoning;
		room._suggestedNudge = cls.suggestedNudge;
		room._wordCount = getRoomWordCount(room);
		room._latestNotes = getLatestNotes(room);
		room._submissionSummaries = getSubmissionSummaries(room);
		room._phase = getRoomPhase(room);
		room._lastInputTime = room.lastInputTime || null;
		room._studentNames = extractStudentNames(room.students);
		room._students = room.students || {};
		room._presence = room.presence || null;
		room._authenticatedStudents = buildAuthStudentList(room);
	}

	function sortRooms(r) {
		const order = { red: 0, yellow: 1, green: 2 };
		return [...r].sort((a, b) => {
			const oa = order[a._status] ?? 3;
			const ob = order[b._status] ?? 3;
			if (oa !== ob) return oa - ob;
			return String(a.id || '').localeCompare(String(b.id || ''));
		});
	}

	let sortedRooms = $derived(sortRooms(rooms));

	// Full refresh
	async function fullRefreshRooms() {
		try {
			const data = await api('workshop-rooms', { params: { sessionId } });
			const fetched = data.rooms || data || [];
			const arr = Array.isArray(fetched) ? fetched : [];
			if (data.rounds) totalRounds = data.rounds;
			arr.forEach(enrichRoom);

			// Seed pulse cache
			arr.forEach((room) => {
				lastPulse[room.id] = {
					id: room.id,
					studentCount: (room._studentNames || []).length,
					submissionCount: (room.submissions || []).length,
					wordCount: room._wordCount || 0,
					lastInputTime: room.lastInputTime || null,
					lastHeartbeat: room.lastHeartbeat || null,
					currentRound: room.currentRound || 1,
					roundStartTime: room.roundStartTime || null
				};
			});

			rooms = arr;
		} catch {
			/* silent */
		}
	}

	// Pulse polling
	async function pollPulse() {
		try {
			const data = await api('workshop-pulse', { params: { sessionId } });
			const pulseRooms = data.rooms || [];
			const changedRoomIds = [];

			for (const p of pulseRooms) {
				const prev = lastPulse[p.id];
				const changed = !prev
					|| prev.lastInputTime !== p.lastInputTime
					|| prev.submissionCount !== p.submissionCount
					|| prev.studentCount !== p.studentCount
					|| prev.wordCount !== p.wordCount
					|| prev.currentRound !== p.currentRound;

				if (changed) {
					changedRoomIds.push(p.id);
					dirtyRooms.add(p.id);
				}
				lastPulse[p.id] = p;
			}

			// Quick update from pulse data
			for (const p of pulseRooms) {
				const idx = rooms.findIndex((r) => String(r.id) === String(p.id));
				if (idx >= 0) {
					if (p.wordCount !== undefined) rooms[idx]._wordCount = p.wordCount;
					if (p.lastInputTime) rooms[idx]._lastInputTime = p.lastInputTime;
					if (p.roundStartTime) rooms[idx].roundStartTime = p.roundStartTime;
					if (p.studentNames) rooms[idx]._studentNames = p.studentNames;
					if (p.currentRound) rooms[idx].currentRound = p.currentRound;
					if (p.presence) rooms[idx]._presence = p.presence;
					if (p.students) rooms[idx]._students = p.students;
				}
			}
			rooms = rooms; // trigger reactivity

			// Fetch full data for changed rooms
			if (changedRoomIds.length > 0) {
				await fetchChangedRooms(changedRoomIds);
			}

			liveConnected = true;
		} catch {
			liveConnected = false;
		}
	}

	async function fetchChangedRooms(roomIds) {
		const fetches = roomIds.map(async (roomId) => {
			try {
				const data = await api('workshop-room', { params: { sessionId, roomId } });
				const room = data.room || data;
				enrichRoom(room);

				const idx = rooms.findIndex((r) => String(r.id) === String(roomId));
				if (idx >= 0) {
					rooms[idx] = room;
				} else {
					rooms.push(room);
				}
			} catch {
				/* silent */
			}
		});
		await Promise.all(fetches);
		rooms = rooms; // trigger reactivity
	}

	// Classification
	async function classifyDirtyRooms() {
		const toClassify = rooms.filter((room) => {
			if (!dirtyRooms.has(room.id)) return false;
			if (!room.submissions || room.submissions.length === 0) return false;
			const lastSubmission = room.lastInputTime;
			const lastClassified = lastClassifyTimestamps[room.id];
			return lastSubmission && lastSubmission !== lastClassified;
		});

		dirtyRooms.clear();

		for (const room of toClassify) {
			try {
				const result = await api('workshop-classify', {
					body: { sessionId, roomId: room.id }
				});
				const cls = result.classification || result;
				room._status = (cls.status || '').toLowerCase();
				room._reasoning = cls.reasoning || '';
				room._suggestedNudge = cls.suggestedNudge || null;
				lastClassifyTimestamps[room.id] = room.lastInputTime;
			} catch {
				/* silent */
			}
		}
		rooms = rooms; // trigger reactivity
	}

	async function checkInactivity() {
		try {
			await api('workshop-classify-inactive', { params: { sessionId } });
		} catch {
			/* silent */
		}
	}

	// Nudge handling
	function openNudge(roomId) {
		const room = rooms.find((r) => String(r.id) === String(roomId));
		nudgeSuggested = room?._suggestedNudge || '';
		nudgeRoomId = roomId;
		nudgeVisible = true;
	}

	function closeNudge() {
		nudgeVisible = false;
		nudgeRoomId = '';
	}

	// Move student handling
	function openMoveStudent(roomId, studentName) {
		moveFromRoomId = roomId;
		moveStudentName = studentName;
		moveVisible = true;
	}

	function closeMoveStudent() {
		moveVisible = false;
		moveStudentName = '';
		moveFromRoomId = '';
	}

	function handleMoveSuccess() {
		closeMoveStudent();
		fullRefreshRooms();
	}

	function handleBack() {
		stopMonitoring();
		onBackToSessions();
	}

	let profileCount = $derived(rooms.reduce((sum, r) => {
		const profiles = Array.isArray(r.capabilityProfiles) ? r.capabilityProfiles : (r.capabilityProfile ? [r.capabilityProfile] : []);
		return sum + profiles.length;
	}, 0));

	function downloadProfiles() {
		if (!sessionId) return;
		const allProfiles = [];
		for (const r of rooms) {
			const profiles = Array.isArray(r.capabilityProfiles) ? r.capabilityProfiles : (r.capabilityProfile ? [r.capabilityProfile] : []);
			for (const p of profiles) {
				allProfiles.push({
					roomId: r.id,
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

	function downloadJSON() {
		if (!sessionId) return;
		const exportData = {
			sessionId,
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
		a.download = `workshop-${sessionId}-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function stopMonitoring() {
		[pulseInterval, fullRefreshInterval, classifyInterval, inactivityInterval].forEach((id) => {
			if (id) clearInterval(id);
		});
	}

	onMount(() => {
		fullRefreshRooms();
		pulseInterval = setInterval(pollPulse, CFG.pulse_interval);
		fullRefreshInterval = setInterval(fullRefreshRooms, CFG.full_refresh_interval);
		classifyInterval = setInterval(classifyDirtyRooms, CFG.classify_interval);
		inactivityInterval = setInterval(checkInactivity, CFG.inactivity_check_interval);
	});

	onDestroy(() => {
		stopMonitoring();
	});
</script>

<OverviewBar {rooms} connected={liveConnected} />

<div class="ws-dash-toolbar">
	<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={handleBack}>Back to Sessions</button>
	<button class="ws-btn ws-btn--small" onclick={() => onProjector(sessionId, '')}>Present Code</button>
	<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={downloadJSON}>Download JSON</button>
	{#if profileCount > 0}
		<button class="ws-btn ws-btn--small" onclick={downloadProfiles}>Download Profiles ({profileCount})</button>
	{/if}
</div>

<div class="ws-room-grid">
	{#each sortedRooms as room (room.id)}
		<RoomCard {room} {totalRounds} onNudge={openNudge} onMoveStudent={openMoveStudent} />
	{/each}
</div>

<NudgeModal
	visible={nudgeVisible}
	roomId={nudgeRoomId}
	{sessionId}
	suggestedNudge={nudgeSuggested}
	onClose={closeNudge}
/>

<MoveStudentModal
	visible={moveVisible}
	{sessionId}
	studentName={moveStudentName}
	fromRoomId={moveFromRoomId}
	{rooms}
	onClose={closeMoveStudent}
	onSuccess={handleMoveSuccess}
/>
