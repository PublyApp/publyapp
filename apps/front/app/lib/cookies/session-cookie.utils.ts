import * as cookie from 'cookie';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

/**
 * Clears non-httpOnly session token cookies from the client.
 *
 * IMPORTANT: This function can ONLY clear non-httpOnly cookies.
 * JavaScript cannot access or modify httpOnly cookies - browsers completely
 * ignore the httpOnly flag when set via document.cookie.
 *
 * For httpOnly cookies, use server-side clearing via Set-Cookie headers
 * (see createClearSessionCookieHeaders in server-cookie.utils.ts).
 *
 * This function tries multiple path combinations to ensure removal of cookies
 * that may have been set with different path attributes.
 *
 * Domain behavior: The 'domain' attribute is intentionally omitted, using the
 * default host-only cookie behavior to match how session cookies are set.
 */
export function clearSessionCookie(): void {
	const clearCookieOptions = [
		// Clear cookie with path='/'
		{ path: '/', expires: new Date(0), maxAge: 0 },
		// Clear cookie without path (current path)
		{ expires: new Date(0), maxAge: 0 },
	];

	clearCookieOptions.forEach((options) => {
		try {
			document.cookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', options);
		} catch (_error) {
			// Ignore errors - this is defensive cleanup
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
