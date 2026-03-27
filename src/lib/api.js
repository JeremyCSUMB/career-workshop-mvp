import { WORKSHOP_CONFIG as CFG } from './config.js';

/**
 * Shared API helper for calling Netlify Functions.
 */
export async function api(endpoint, opts = {}) {
	const url = opts.params
		? `${CFG.api_base}/${endpoint}?${new URLSearchParams(opts.params)}`
		: `${CFG.api_base}/${endpoint}`;

	const fetchOpts = { method: opts.method || (opts.body ? 'POST' : 'GET') };
	if (opts.body) {
		fetchOpts.headers = { 'Content-Type': 'application/json' };
		fetchOpts.body = JSON.stringify(opts.body);
	}

	const res = await fetch(url, fetchOpts);
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		const err = new Error(data.error || `API error ${res.status}`);
		err.status = res.status;
		err.data = data;
		throw err;
	}
	return res.json();
}
