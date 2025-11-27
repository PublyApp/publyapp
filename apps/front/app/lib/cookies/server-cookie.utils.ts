import * as cookie from 'cookie';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

/**
 * Creates headers to clear session cookies with all possible flag combinations.
 * This is critical for clearing httpOnly cookies that JavaScript cannot access.
 *
 * IMPORTANT: This must be called from server-side code (loaders/actions) to work.
 */
export function createClearSessionCookieHeaders(): Headers {
	const headers = new Headers();

	// Clear cookie with various flag combinations to ensure removal
	// This handles cases where cookies were set with different flags
	const clearCookieOptions = [
		// Standard clear
		{ path: '/', expires: new Date(0), maxAge: 0 },
		// Clear httpOnly cookie
		{
			path: '/',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			secure: true,
			sameSite: 'lax' as const,
		},
		// Clear with different sameSite values
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
