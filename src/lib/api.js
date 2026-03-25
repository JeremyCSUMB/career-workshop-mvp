import { WORKSHOP_CONFIG as CFG } from './config.js';

/**
 * Shared API helper for calling Netlify Functions.
 */
export async function api(endpoint, opts = {}) {
	const url = opts.params
		? `${CFG.api_base}/${endpoint}?${new URLSearchParams(opts.params)}`
		: `${CFG.api_base}/${endpoint}`;

	const fetchOpts = { method: opts.method || 'GET' };
	if (opts.body) {
		fetchOpts.method = 'POST';
		fetchOpts.headers = { 'Content-Type': 'application/json' };
		fetchOpts.body = JSON.stringify(opts.body);
	}

	const res = await fetch(url, fetchOpts);
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error(data.error || `API error ${res.status}`);
	}
	return res.json();
}
