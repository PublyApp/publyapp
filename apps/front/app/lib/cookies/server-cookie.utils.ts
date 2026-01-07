import * as cookie from 'cookie';

import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

/**
 * Creates headers to clear session cookies with all possible flag combinations.
 * This is critical for clearing httpOnly cookies that JavaScript cannot access.
 *
 * IMPORTANT: This must be called from server-side code (loaders/actions) to work.
 *
 * Domain behavior: The 'domain' attribute is intentionally omitted from all clear
 * operations. This uses the default host-only cookie behavior, which matches how
 * session cookies are currently set in the app (login, accept-invitation, etc.).
 * Setting explicit domain values could prevent proper cookie clearing if the
 * original cookie was set with different domain settings.
 */
export function createClearSessionCookieHeaders(): Headers {
	const headers = new Headers();

	// Clear cookie with various flag combinations to ensure removal
	// This handles cases where cookies were set with different flags
	const clearCookieOptions = [
		// Standard clear (non-httpOnly)
		{ path: '/', expires: new Date(0), maxAge: 0 },
		// Clear httpOnly cookie (non-secure, for localhost/HTTP)
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
		},
		// Clear httpOnly cookie with sameSite (non-secure, for localhost/HTTP)
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			sameSite: 'lax' as const,
		},
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			sameSite: 'strict' as const,
		},
		// Clear httpOnly secure cookie (for production/HTTPS)
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			secure: true,
			sameSite: 'lax' as const,
		},
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			secure: true,
			sameSite: 'strict' as const,
		},
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			secure: true,
			sameSite: 'none' as const,
		},
	];

	clearCookieOptions.forEach((options) => {
		const clearCookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', options);
		headers.append('Set-Cookie', clearCookie);
	});

	return headers;
}
