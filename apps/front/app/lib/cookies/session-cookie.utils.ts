import * as cookie from 'cookie';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

/**
 * Clears session token cookie with multiple flag combinations to ensure removal.
 * This handles cases where httpOnly or other flags might have been set,
 * which could cause security issues (DoS attacks via infinite API calls).
 *
 * Note: JavaScript cannot set httpOnly cookies, but attempting to clear with
 * matching path and flags may help browsers remove them properly.
 */
export function clearSessionCookie(): void {
	const clearCookieOptions = [
		// Clear cookie with path='/'
		{ path: '/', expires: new Date(0), maxAge: 0 },
		// Clear cookie with path='/' and httpOnly
		{ path: '/', expires: new Date(0), maxAge: 0, httpOnly: true },
		// Clear cookie with path='/' and all security flags
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			secure: true,
			sameSite: 'lax' as const,
		},
		// Clear cookie without path (current path)
		{ expires: new Date(0), maxAge: 0 },
	];

	clearCookieOptions.forEach((options) => {
		try {
			document.cookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', options);
		} catch (_error) {
			// Ignore errors - this is defensive cleanup
			// Some options (like httpOnly) cannot be set from JavaScript
		}
	});
}

/**
 * Checks if session token cookie is readable from JavaScript.
 * Returns undefined if cookie doesn't exist or is httpOnly.
 */
export function getSessionCookieFromClient(): string | undefined {
	const browserCookies = cookie.parse(document.cookie);
	return browserCookies[SESSION_TOKEN_COOKIE_KEY];
}
