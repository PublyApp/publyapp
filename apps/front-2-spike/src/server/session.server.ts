import { createServerFn } from '@tanstack/react-start';
import { setCookie, setResponseHeader } from '@tanstack/react-start/server';
import * as cookie from 'cookie';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { createClient } from '../lib/api-client';
import { formatSessionCookie } from '../lib/session-cookie';

// =============================================================================
// Cookie-I/O server functions — the ONLY legitimate use of createServerFn in this
// spike (Architecture gate / spec §4.1). These set/clear the session cookie; they
// NEVER relay application data (that goes direct-Kiota: browser client + SSR loader).
// =============================================================================

type LoginInput = { email: string; password: string };

/**
 * Login — STEP 1 ONLY (set cookie + return ok).
 *
 * Calls the API via the SERVER Kiota client, then writes the JS-READABLE session cookie
 * (NOT httpOnly — matches the current shipped app's `getSessionTokensFromClient()`),
 * with `expires`/`maxAge` derived from the API's `sessionExpiresAt`.
 *
 * The redirect decision (auth.redirectCode.get) is made on the NEXT request — because of
 * #5615 (a cookie set this request is not readable via getCookie this request). So this
 * fn does NOT pretend a `redirectCode` exists on the login response.
 */
export const login = createServerFn({ method: 'POST' })
	.validator((d: LoginInput) => d)
	.handler(async ({ data }) => {
		const res = await createClient({ base: 'server' }).auth.login.post({
			email: { getValue: () => data.email },
			password: { getValue: () => data.password },
		});

		if (!res?.sessionToken) throw new Error('login failed');

		const sessionExpiresAt = res.sessionExpiresAt;
		const maxAge = sessionExpiresAt
			? Math.max(
					0,
					Math.floor(
						(new Date(sessionExpiresAt).getTime() - Date.now()) / 1000,
					),
				)
			: undefined;

		setCookie(
			SESSION_TOKEN_COOKIE_KEY,
			formatSessionCookie({ staffToken: res.sessionToken }),
			{
				httpOnly: false,
				secure: true,
				sameSite: 'lax',
				path: '/',
				...(maxAge !== undefined && sessionExpiresAt
					? { maxAge, expires: new Date(sessionExpiresAt) }
					: {}),
			},
		);

		// Redirect decided on the NEXT request (auth.redirectCode.get) per #5615.
		return { ok: true };
	});

/**
 * clearSession — emit the FULL clear matrix (ported verbatim from
 * apps/front/src/lib/cookies/server-cookie.utils.ts → createClearSessionCookieHeaders),
 * clearing every flag-variant the cookie could have been set with so logout is total.
 */
export const clearSession = createServerFn({ method: 'POST' }).handler(
	async () => {
		const base = { path: '/', expires: new Date(0), maxAge: 0 };
		const variants = [
			base,
			{ ...base, httpOnly: true },
			{ ...base, httpOnly: true, sameSite: 'lax' as const },
			{ ...base, httpOnly: true, sameSite: 'strict' as const },
			{ ...base, httpOnly: true, secure: true, sameSite: 'lax' as const },
			{ ...base, httpOnly: true, secure: true, sameSite: 'strict' as const },
			{ ...base, httpOnly: true, secure: true, sameSite: 'none' as const },
		];
		setResponseHeader(
			'Set-Cookie',
			variants.map((o) => cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', o)),
		);
	},
);
