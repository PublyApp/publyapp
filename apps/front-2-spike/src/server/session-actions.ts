import { createServerFn } from '@tanstack/react-start';
import {
	getRequestHeader,
	setCookie,
	setResponseHeader,
} from '@tanstack/react-start/server';
import * as cookie from 'cookie';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';

import { createClient } from '../lib/api-client';
import {
	formatSessionCookie,
	getSessionTokensFromCookieHeader,
} from '../lib/session-cookie';

// =============================================================================
// Cookie-I/O server functions — the ONLY legitimate use of createServerFn in this
// spike (Architecture gate / spec §4.1). These set/clear the session cookie; they
// NEVER relay application data (that goes direct-Kiota: browser client + SSR loader).
// =============================================================================

type LoginInput = { email: string; password: string };
type LoginResult = { ok: true; sessionExpiresAt: string | undefined };
type LoginRedirectInput = { sessionExpiresAt: string | undefined };

const resolveSessionCookieMaxAge = (sessionExpiresAt: string | undefined) => {
	if (!sessionExpiresAt) {
		return undefined;
	}

	const expiresAt = new Date(sessionExpiresAt);
	const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

	if (Number.isNaN(maxAge)) {
		return undefined;
	}

	return {
		expires: expiresAt,
		maxAge: Math.max(0, maxAge),
	};
};

export const getLoginSessionCookieValue = (sessionToken: string) => {
	return formatSessionCookie({ tenantToken: sessionToken });
};

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

		const sessionExpiresAt = res.sessionExpiresAt
			? res.sessionExpiresAt.toISOString()
			: undefined;
		const options = resolveSessionCookieMaxAge(sessionExpiresAt);

		setCookie(
			SESSION_TOKEN_COOKIE_KEY,
			// TODO(2.4): upgrade to staff slot after auth.redirectCode proves STAFF
			getLoginSessionCookieValue(res.sessionToken),
			{
				httpOnly: false,
				secure: true,
				sameSite: 'lax',
				path: '/',
				...(options
					? { maxAge: options.maxAge, expires: options.expires }
					: {}),
			},
		);

		// Redirect decided on the NEXT request (auth.redirectCode.get) per #5615.
		return { ok: true, sessionExpiresAt } satisfies LoginResult;
	});

/**
 * Login step 2 (new request): resolve the redirect scope from the session token
 * now present in the request cookie, then return the target app path.
 *
 * This must be a separate request because `setCookie` updates are not visible
 * inside the same request that writes them (see #5615).
 */
export const completeLoginRedirect = createServerFn({ method: 'POST' })
	.validator((d: LoginRedirectInput) => d)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader('cookie');
		const { staffToken, tenantToken } =
			getSessionTokensFromCookieHeader(cookieHeader);
		const sessionToken = staffToken ?? tenantToken;

		if (!sessionToken) {
			throw new Response('missing session token', {
				status: 401,
			});
		}

		const result = await createClient({
			sessionToken,
			base: 'server',
		}).auth.redirectCode.get();

		const redirectCode = result?.redirectCode;
		const cookieMaxAge = resolveSessionCookieMaxAge(data?.sessionExpiresAt);

		if (redirectCode === REDIRECT_CODE.STAFF) {
			setCookie(
				SESSION_TOKEN_COOKIE_KEY,
				formatSessionCookie({ staffToken: sessionToken }),
				{
					httpOnly: false,
					secure: true,
					sameSite: 'lax',
					path: '/',
					...(cookieMaxAge
						? { maxAge: cookieMaxAge.maxAge, expires: cookieMaxAge.expires }
						: {}),
				},
			);

			return { targetPath: '/staff/staff-users' };
		}

		if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			throw new Response('user does not have access', {
				status: 403,
			});
		}

		if (redirectCode === REDIRECT_CODE.TENANT_PICKER) {
			return { targetPath: '/' };
		}

		return { targetPath: '/' };
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
