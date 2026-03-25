import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

function createDashboardStore() {
	const initial = {
		authenticated: browser ? sessionStorage.getItem('ws_dash_auth') === 'true' : false,
		sessionId: browser ? sessionStorage.getItem('ws_dash_sessionId') || '' : '',
		screen: 'login', // login | session | dashboard | analytics
		rooms: [],
		lastPulse: {},
		dirtyRooms: new Set(),
		lastClassifyTimestamps: {},
		nudgeTargetRoomId: null,
		analyticsSessionId: '',
		analyticsCache: {},
		liveConnected: true
	};

	const { subscribe, set, update } = writable(initial);

	return {
		subscribe,
		set,
		update,
		setAuthenticated(val) {
			update((s) => {
				s.authenticated = val;
				if (browser) {
					if (val) sessionStorage.setItem('ws_dash_auth', 'true');
					else sessionStorage.removeItem('ws_dash_auth');
				}
				return s;
			});
		},
		setSessionId(id) {
			update((s) => {
				s.sessionId = id;
				if (browser) {
					if (id) sessionStorage.setItem('ws_dash_sessionId', id);
					else sessionStorage.removeItem('ws_dash_sessionId');
				}
				return s;
			});
		},
		setScreen(name) {
			update((s) => ({ ...s, screen: name }));
		},
		setRooms(rooms) {
			update((s) => ({ ...s, rooms }));
		},
		updateRoom(roomId, roomData) {
			update((s) => {
				const idx = s.rooms.findIndex((r) => String(r.id) === String(roomId));
				if (idx >= 0) {
					s.rooms[idx] = roomData;
				} else {
					s.rooms.push(roomData);
				}
				return { ...s };
			});
		},
		cacheAnalytics(sessionId, data) {
			update((s) => {
				s.analyticsCache[sessionId] = data;
				s.analyticsSessionId = sessionId;
				return { ...s };
			});
		}
	};
}

export const dashboardState = createDashboardStore();
