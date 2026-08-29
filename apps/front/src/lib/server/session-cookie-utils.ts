import { getRequestHeader, setCookie } from '@tanstack/react-start/server';
import * as cookie from 'cookie';
import { isProductionRuntime } from '~/lib/env';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import {
	parseSessionCookie,
	formatSessionCookie,
} from '@org/shared-ts/lib/session/parse';

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

/**
 * Deploy configuration decides this, not the request (shell r2-F14): a proxy
 * that strips `X-Forwarded-Proto`, or a same-origin fetch sent under a
 * strict referrer policy, would otherwise reach this handler with no
 * https signal at all and issue the session cookie without `Secure` on an
 * HTTPS deployment. Production is always served over HTTPS (Traefik SSL —
 * see AGENTS.md), so it never needs to guess. The header sniff survives
 * only as a dev-time fallback for local HTTPS tunnels.
 */
const isSecureCookieContext = (): boolean => {
	if (isProductionRuntime()) {
		return true;
	}

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

/**
 * These helpers wrap `@tanstack/react-start/server` APIs and MUST only be
 * called from inside `createServerFn` handler bodies. The compiler strips
 * handler bodies (and their now-unused imports) from the client bundle, but
 * it cannot strip exported top-level symbols — so this module's exports must
 * never be referenced outside a handler body, or the server import leaks
 * into the client build and import-protection fails it.
 */
export const readSessionCookieValue = (): string | undefined => {
	const header = getSessionCookieHeader();
	if (!header) {
		return undefined;
	}

	// `setCookie` below percent-encodes the value (it contains a literal ":"
	// scope prefix, e.g. "t:<token>"); use cookie.parse's default decoder
	// (decodeURIComponent) to reverse that, not an identity no-op, or the
	// scope prefix regex in parseSessionCookie never matches and the token is
	// unusable (surfaces as a false "session token is invalid or expired").
	const parsed = cookie.parse(header);
	const sessionCookieValue = parsed[SESSION_TOKEN_COOKIE_KEY];
	if (typeof sessionCookieValue === 'string') {
		return sessionCookieValue;
	}
	return undefined;
};

export const readSessionTokensFromCookie = (): RawCookieSessionTokens => {
	const sessionCookieValue = readSessionCookieValue();
	if (!sessionCookieValue) {
		return {};
	}

	return parseSessionCookie(sessionCookieValue);
};

export const getCookieOptions = (
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

export const buildTenantSessionCookie = (sessionToken: string) => {
	return formatSessionCookie({ tenantToken: sessionToken });
};
