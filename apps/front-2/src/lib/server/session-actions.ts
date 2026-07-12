import { createUntypedString } from '@microsoft/kiota-abstractions';
import { createServerFn } from '@tanstack/react-start';
import {
	getRequestHeader,
	setCookie,
	setResponseHeader,
} from '@tanstack/react-start/server';
import * as cookie from 'cookie';
import { z } from 'zod';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import {
	parseSessionCookie,
	selectToken,
	formatSessionCookie,
} from '@org/shared-ts/lib/session/parse';

import { createClient } from '../api-client/client-manager';
import { throwServerFailure } from './server-failure';

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

type RawCookieSessionTokens = {
	tenantToken?: string;
	staffToken?: string;
};

const resolveCookieMaxAge = (sessionExpiresAt: string | undefined) => {
	if (!sessionExpiresAt) {
		return undefined;
	}

	const expires = new Date(sessionExpiresAt);
	if (Number.isNaN(expires.getTime())) {
		return undefined;
	}

	const maxAge = Math.floor((expires.getTime() - Date.now()) / 1000);
	return {
		expires,
		maxAge: Math.max(0, maxAge),
	};
};

const getSessionCookieHeader = (): string | undefined => {
	try {
		return getRequestHeader('cookie');
	} catch {
		return undefined;
	}
};

const getRequestHeaderSafe = (name: string): string | undefined => {
	try {
		return getRequestHeader(name);
	} catch {
		return undefined;
	}
};

const isSecureCookieContext = (): boolean => {
	const origin = getRequestHeaderSafe('origin');
	if (origin?.startsWith('https://')) {
		return true;
	}

	const forwardedProto = getRequestHeaderSafe('x-forwarded-proto');
	if (forwardedProto) {
		return forwardedProto.split(',')[0]?.trim() === 'https';
	}

	const referer = getRequestHeaderSafe('referer');
	return referer?.startsWith('https://') ?? false;
};

const readSessionTokensFromCookie = (): RawCookieSessionTokens => {
	const header = getSessionCookieHeader();
	if (!header) {
		return {};
	}

	// `setCookie` below percent-encodes the value (it contains a literal ":"
	// scope prefix, e.g. "t:<token>"); use cookie.parse's default decoder
	// (decodeURIComponent) to reverse that, not an identity no-op, or the
	// scope prefix regex in parseSessionCookie never matches and the token is
	// unusable (surfaces as a false "session token is invalid or expired").
	const parsed = cookie.parse(header);
	const sessionCookieValue = parsed[SESSION_TOKEN_COOKIE_KEY];
	if (!sessionCookieValue || typeof sessionCookieValue !== 'string') {
		return {};
	}

	return parseSessionCookie(sessionCookieValue);
};

const getCookieOptions = (
	sessionExpiresAt: string | undefined,
): Parameters<typeof setCookie>[2] => {
	const isSecure = isSecureCookieContext();
	const options: Parameters<typeof setCookie>[2] = {
		path: '/',
		secure: isSecure,
		httpOnly: false,
		sameSite: 'lax',
	};

	const ttl = resolveCookieMaxAge(sessionExpiresAt);
	if (!ttl) {
		return options;
	}

	return {
		...options,
		expires: ttl.expires,
		maxAge: ttl.maxAge,
	};
};

const buildTenantSessionCookie = (sessionToken: string) => {
	return formatSessionCookie({ tenantToken: sessionToken });
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
	email: z.string().min(1).email().max(120),
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
			throw {
				responseStatusCode: 401,
				status: 401,
				title: 'Unauthorized',
				detail: 'missing session token',
			};
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

export const completeLoginRedirect = createServerFn({ method: 'POST' })
	.validator((data): LoginRedirectInput => LoginRedirectInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { staffToken, tenantToken } = readSessionTokensFromCookie();
		const sessionToken =
			selectToken({ staffToken, tenantToken }, 'tenant') ||
			selectToken({ staffToken, tenantToken }, 'staff');

		if (!sessionToken) {
			throw {
				responseStatusCode: 401,
				status: 401,
				title: 'Unauthorized',
				detail: 'missing session token',
			};
		}

		let result: { redirectCode?: string | null } | undefined;
		try {
			result = await createClient({
				getSessionToken: () => sessionToken,
			}).auth.redirectCode.get();
		} catch (error) {
			throwServerFailure(error, 'failed to resolve redirect scope');
		}

		const redirectCode = result?.redirectCode;

		setCookie(
			SESSION_TOKEN_COOKIE_KEY,
			resolveRedirectSessionCookieValue(sessionToken, redirectCode ?? 'tenant'),
			getCookieOptions(data?.sessionExpiresAt),
		);

		if (!redirectCode || redirectCode === REDIRECT_CODE.TENANT_PICKER) {
			return { targetPath: '/tenant' } satisfies LoginRedirectResult;
		}

		if (redirectCode === REDIRECT_CODE.STAFF) {
			return { targetPath: '/staff' } satisfies LoginRedirectResult;
		}

		if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			throw {
				responseStatusCode: 403,
				status: 403,
				title: 'Forbidden',
				detail: 'user has no accessible scope',
			};
		}

		return { targetPath: '/tenant' } satisfies LoginRedirectResult;
	});

export const clearSession = createServerFn({ method: 'POST' }).handler(
	async () => {
		const base: {
			path: string;
			expires: Date;
			maxAge: number;
		} = {
			path: '/',
			expires: new Date(0),
			maxAge: 0,
		};

		const variants = [
			{},
			{ httpOnly: true },
			{ httpOnly: true, sameSite: 'lax' as const },
			{ httpOnly: true, sameSite: 'strict' as const },
			{ httpOnly: true, secure: true, sameSite: 'lax' as const },
			{ httpOnly: true, secure: true, sameSite: 'strict' as const },
			{ httpOnly: true, secure: true, sameSite: 'none' as const },
		];

		const headers = variants.map((variant) =>
			cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', {
				...base,
				...variant,
			}),
		);

		setResponseHeader('Set-Cookie', headers);
	},
);
