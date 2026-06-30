import { createServerFn } from '@tanstack/react-start';
import {
	getRequestHeader,
	setCookie,
	setResponseHeader,
} from '@tanstack/react-start/server';
import * as cookie from 'cookie';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import {
	parseSessionCookie,
	selectToken,
	formatSessionCookie,
} from '@org/shared-ts/lib/session/parse';
import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import { toApiFailure } from '@org/shared-ts/lib/api-failure';

import { createClient } from '../api-client/client-manager';

type LoginInput = {
	email: string;
	password: string;
};

type LoginResult = {
	sessionExpiresAt?: string;
};

type LoginClientResult = LoginResult & {
	sessionToken?: string;
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

	const parsed = cookie.parse(header, { decode: (value) => value });
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

const resolveRedirectSessionCookieValue = (sessionToken: string, code: string) => {
	if (code === REDIRECT_CODE.STAFF) {
		return buildStaffSessionCookie(sessionToken);
	}

	return buildTenantSessionCookie(sessionToken);
};

export const login = createServerFn({ method: 'POST' })
	.validator((data: LoginInput) => data)
	.handler(async ({ data }) => {
		let result: LoginClientResult | undefined;
		try {
			result = await createClient({ getSessionToken: () => undefined }).auth.login.post({
				email: { getValue: () => data.email },
				password: { getValue: () => data.password },
			});
		} catch (error) {
			const failure = toApiFailure(error);

			if (
				(failure.kind === 'problem' || failure.kind === 'validation') &&
				failure.status
			) {
				throw new Response(failure.title ?? failure.detail ?? 'login failed', {
					status: failure.status,
				});
			}

			throw new Response('login failed', { status: 500 });
		}

		if (!result?.sessionToken) {
			throw new Response('login failed', { status: 401 });
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
	.validator((data: LoginRedirectInput) => data)
	.handler(async ({ data }) => {
		const { staffToken, tenantToken } = readSessionTokensFromCookie();
		const sessionToken = selectToken(
			{ staffToken, tenantToken },
			'tenant',
		)
			|| selectToken({ staffToken, tenantToken }, 'staff');

		if (!sessionToken) {
			throw new Response('missing session token', { status: 401 });
		}

		const result = await createClient({
			getSessionToken: () => sessionToken,
		}).auth.redirectCode.get();

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
			throw new Response('user has no accessible scope', { status: 403 });
		}

		return { targetPath: '/tenant' } satisfies LoginRedirectResult;
	});

export const clearSession = createServerFn({ method: 'POST' }).handler(async () => {
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
});
