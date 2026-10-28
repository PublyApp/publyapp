import { createUntypedString } from '@microsoft/kiota-abstractions';
import { createServerFn } from '@tanstack/react-start';
import { setCookie, setResponseHeader } from '@tanstack/react-start/server';
import * as cookie from 'cookie';
import { z } from 'zod';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import {
	selectToken,
	formatSessionCookie,
} from '@org/shared-ts/lib/session/parse';

import { createClient } from '../api-client/client-manager';
import { determineServerSessionAction } from '../session/session-scope';
import { ServerFailure, throwServerFailure } from './server-failure';
import {
	buildTenantSessionCookie,
	getCookieOptions,
	readSessionCookieValue,
	readSessionTokensFromCookie,
} from './session-cookie-utils';

type LoginInput = {
	email: string;
	password: string;
};

type LoginResult = {
	sessionExpiresAt?: string | Date | null;
};

type LoginClientResult = LoginResult & {
	sessionToken?: string | null;
};

type LoginRedirectInput = {
	sessionExpiresAt?: string;
};

type LoginRedirectResult = {
	targetPath: string;
};

const buildStaffSessionCookie = (sessionToken: string) => {
	return formatSessionCookie({ staffToken: sessionToken });
};

const resolveLoginSessionCookieValue = (sessionToken: string) => {
	return buildTenantSessionCookie(sessionToken);
};

const resolveRedirectSessionCookieValue = (
	sessionToken: string,
	code: string,
) => {
	if (code === REDIRECT_CODE.STAFF) {
		return buildStaffSessionCookie(sessionToken);
	}

	return buildTenantSessionCookie(sessionToken);
};

const LoginInputSchema = z.object({
	email: z.email().min(1).max(120),
	password: z.string().min(1),
});

const LoginRedirectInputSchema = z.object({
	sessionExpiresAt: z.string().optional(),
});

export const login = createServerFn({ method: 'POST' })
	.validator((data): LoginInput => LoginInputSchema.parse(data))
	.handler(async ({ data }) => {
		let result: LoginClientResult | undefined;
		try {
			const client = createClient({ getSessionToken: () => undefined });
			const body = {
				email: createUntypedString(data.email),
				password: createUntypedString(data.password),
			} as Parameters<typeof client.auth.login.post>[0];

			result = await client.auth.login.post(body);
		} catch (error) {
			throwServerFailure(error, 'login failed');
		}

		if (!result?.sessionToken) {
			throw new ServerFailure({
				responseStatusCode: 401,
				status: 401,
				title: 'Unauthorized',
				detail: 'missing session token',
			});
		}

		const sessionExpiresAt = result?.sessionExpiresAt
			? new Date(result.sessionExpiresAt).toISOString()
			: undefined;

		setCookie(
			SESSION_TOKEN_COOKIE_KEY,
			resolveLoginSessionCookieValue(result.sessionToken),
			getCookieOptions(sessionExpiresAt),
		);

		return { sessionExpiresAt };
	});

const getSessionTokenFromCookieOrThrow = (): string => {
	const { staffToken, tenantToken } = readSessionTokensFromCookie();
	const sessionToken =
		selectToken({ staffToken, tenantToken }, 'tenant') ||
		selectToken({ staffToken, tenantToken }, 'staff');

	if (!sessionToken) {
		throw new ServerFailure({
			responseStatusCode: 401,
			status: 401,
			title: 'Unauthorized',
			detail: 'missing session token',
		});
	}

	return sessionToken;
};

/**
 * Shared by `completeLoginRedirect` (which also rewrites the session cookie's
 * scope prefix and expiry) and `resolveWorkspacePath` (a read-only variant
 * for the auth-page guard, which must never touch the cookie — see F9: a
 * guard call with no `sessionExpiresAt` would otherwise downgrade an
 * existing persistent cookie to a session-only one on every `/login` visit).
 */
const resolveRedirectCodeAndTarget = async (
	sessionToken: string,
): Promise<{
	redirectCode: string | null | undefined;
	targetPath: LoginRedirectResult['targetPath'];
}> => {
	let result: { redirectCode?: string | null } | undefined;
	try {
		result = await createClient({
			getSessionToken: () => sessionToken,
		}).auth.redirectCode.get();
	} catch (error) {
		throwServerFailure(error, 'failed to resolve redirect scope');
	}

	const redirectCode = result?.redirectCode;

	if (redirectCode === REDIRECT_CODE.STAFF) {
		return { redirectCode, targetPath: '/staff' };
	}

	if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
		throw new ServerFailure({
			responseStatusCode: 403,
			status: 403,
			title: 'Forbidden',
			detail: 'user has no accessible scope',
		});
	}

	return { redirectCode, targetPath: '/tenant' };
};

export const completeLoginRedirect = createServerFn({ method: 'POST' })
	.validator((data): LoginRedirectInput => LoginRedirectInputSchema.parse(data))
	.handler(async ({ data }) => {
		const sessionToken = getSessionTokenFromCookieOrThrow();
		const { redirectCode, targetPath } =
			await resolveRedirectCodeAndTarget(sessionToken);

		setCookie(
			SESSION_TOKEN_COOKIE_KEY,
			resolveRedirectSessionCookieValue(sessionToken, redirectCode ?? 'tenant'),
			getCookieOptions(data?.sessionExpiresAt),
		);

		return { targetPath } satisfies LoginRedirectResult;
	});

/**
 * Read-only counterpart to `completeLoginRedirect` for the auth-page guard
 * (`redirectAuthenticatedUserAwayFromAuthPage`): resolves where an
 * already-authenticated visitor belongs without rewriting the session
 * cookie. Never call this from the real post-login path — it doesn't know
 * `sessionExpiresAt` and must not be trusted to set the cookie's expiry.
 */
export const resolveWorkspacePath = createServerFn({ method: 'POST' }).handler(
	async () => {
		const sessionToken = getSessionTokenFromCookieOrThrow();
		const { targetPath } = await resolveRedirectCodeAndTarget(sessionToken);
		return { targetPath } satisfies LoginRedirectResult;
	},
);

export const getServerSessionAction = createServerFn({
	method: 'GET',
}).handler(() => determineServerSessionAction(readSessionCookieValue()));

/**
 * Long enough for a healthy same-origin round trip, short enough that an
 * unreachable API cannot hold the logout click hostage: the cookie is cleared
 * whether or not the revocation lands.
 */
const REVOKE_SESSION_TIMEOUT_MS = 3000;

const readPresentedSessionTokens = (): string[] => {
	const { staffToken, tenantToken } = readSessionTokensFromCookie();
	const tokens = [staffToken, tenantToken].filter(
		(token): token is string => typeof token === 'string' && token.length > 0,
	);

	return [...new Set(tokens)];
};

/**
 * Revokes the sessions this request's cookie presents, server-side (#1498).
 * Clearing the cookie alone leaves a valid `sessions` row behind: a token
 * copied before logout keeps authenticating until it expires.
 *
 * Best-effort by construction — a logout is a client-side promise the user
 * already acted on, so it must complete even when the API is down, slow, or
 * says the token is not a regular session. In particular the API refuses to
 * revoke an impersonation session through this endpoint (that path owns its
 * own `impersonation.ended` audit), so a 403 there is expected and leaves
 * that row for the impersonation flow to end.
 */
const revokePresentedSessions = async (): Promise<void> => {
	await Promise.all(
		readPresentedSessionTokens().map(async (sessionToken) => {
			try {
				await createClient({
					getSessionToken: () => sessionToken,
					signal: AbortSignal.timeout(REVOKE_SESSION_TIMEOUT_MS),
				}).auth.revokeSession.post();
			} catch (error) {
				logger.warn(
					'logout: session revocation failed; clearing the cookie anyway',
					error,
				);
			}
		}),
	);
};

export const clearSession = createServerFn({ method: 'POST' }).handler(
	async () => {
		await revokePresentedSessions();

		// Cookie deletion is matched by the browser on (name, domain, path)
		// only — httpOnly/secure/sameSite play no part in whether this
		// overwrites the cookie set by `getCookieOptions`, so one header
		// serialized with the same `path` is sufficient.
		setResponseHeader(
			'Set-Cookie',
			cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', {
				path: '/',
				expires: new Date(0),
				maxAge: 0,
			}),
		);
	},
);
