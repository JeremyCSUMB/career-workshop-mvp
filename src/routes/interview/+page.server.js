import { redirect } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';

/** @type {import('./$types').PageServerLoad} */
export function load({ cookies, url }) {
	const session = cookies.get('session');

	if (!session) {
		const loginUrl = buildLoginRedirect(url);
		throw redirect(302, loginUrl);
	}

	try {
		const secret = process.env.SESSION_SECRET;
		if (!secret) {
			throw new Error('Missing SESSION_SECRET');
		}

		const payload = jwt.verify(session, secret);
		return {
			user: {
				name: payload.name,
				email: payload.email,
				picture: payload.picture
			}
		};
	} catch {
		const loginUrl = buildLoginRedirect(url);
		throw redirect(302, loginUrl);
	}
}

function buildLoginRedirect(url) {
	// Preserve the full path + query params (e.g., /interview?code=ABC123)
	const redirectPath = url.pathname + url.search;
	const loginUrl = new URL('/login', url.origin);
	loginUrl.searchParams.set('redirect', redirectPath);
	return loginUrl.pathname + loginUrl.search;
}
