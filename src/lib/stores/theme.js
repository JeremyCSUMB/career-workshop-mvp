import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createThemeStore() {
	const stored = browser ? localStorage.getItem('ws_theme') : null;
	const prefersDark = browser ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
	const initial = stored || (prefersDark ? 'dark' : 'light');

	const { subscribe, set, update } = writable(initial);

	return {
		subscribe,
		toggle() {
			update((current) => {
				const next = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					localStorage.setItem('ws_theme', next);
					document.documentElement.setAttribute('data-theme', next);
				}
				return next;
			});
		},
		init() {
			if (browser) {
				const val = stored || (prefersDark ? 'dark' : 'light');
				document.documentElement.setAttribute('data-theme', val);
				set(val);
			}
		}
	};
}

export const theme = createThemeStore();
