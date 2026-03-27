import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

function load(key, fallback) {
	if (!browser) return fallback;
	const v = localStorage.getItem(key);
	return v !== null ? v : fallback;
}

function createInterviewStore() {
	const initial = {
		sessionId: load('ws_sessionId', ''),
		roomId: load('ws_roomId', ''),
		studentName: load('ws_studentName', ''),
		round: parseInt(load('ws_round', '1'), 10),
		phase: load('ws_phase', 'entry'),
		students: [],
		role: null,
		partnerName: '',
		customTags: [],
		totalRounds: parseInt(load('ws_totalRounds', '1'), 10),
		prompts: (() => { try { return JSON.parse(load('ws_prompts', '[]')); } catch { return []; } })(),
		codeFromUrl: false
	};

	const { subscribe, set, update } = writable(initial);

	function persist() {
		if (!browser) return;
		const s = get({ subscribe });
		localStorage.setItem('ws_sessionId', s.sessionId);
		localStorage.setItem('ws_roomId', s.roomId);
		localStorage.setItem('ws_studentName', s.studentName);
		localStorage.setItem('ws_round', String(s.round));
		localStorage.setItem('ws_phase', s.phase);
		localStorage.setItem('ws_totalRounds', String(s.totalRounds));
		localStorage.setItem('ws_prompts', JSON.stringify(s.prompts));
	}

	return {
		subscribe,
		set,
		update(fn) {
			update(fn);
			persist();
		},
		/** Reset to clean entry state */
		reset() {
			if (browser) {
				['ws_sessionId', 'ws_roomId', 'ws_studentName', 'ws_round', 'ws_phase', 'ws_totalRounds', 'ws_prompts'].forEach((k) => localStorage.removeItem(k));
			}
			set({
				sessionId: '',
				roomId: '',
				studentName: '',
				round: 1,
				phase: 'entry',
				students: [],
				role: null,
				partnerName: '',
				customTags: [],
				totalRounds: 1,
				prompts: [],
				codeFromUrl: false
			});
		},
		persist
	};
}

export const interviewState = createInterviewStore();
