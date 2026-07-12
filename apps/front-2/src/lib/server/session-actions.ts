import { createUntypedString } from '@microsoft/kiota-abstractions';
import { createServerFn } from '@tanstack/react-start';
import { setCookie, setResponseHeader } from '@tanstack/react-start/server';
import * as cookie from 'cookie';
import { z } from 'zod';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { REDIRECT_CODE } from '@org/shared-ts/lib/constants';
import {
	selectToken,
	formatSessionCookie,
} from '@org/shared-ts/lib/session/parse';

import { createClient } from '../api-client/client-manager';
import { throwServerFailure } from './server-failure';
import {
	buildTenantSessionCookie,
	getCookieOptions,
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
