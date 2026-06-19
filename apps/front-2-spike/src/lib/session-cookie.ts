import { parse as parseCookieHeader } from 'cookie';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

// =============================================================================
// PURE session-cookie parse/format — NO `@tanstack/react-start` imports.
//
// Vitest imports this module directly (Task 2.2), and `api-client.ts` +
// `session-cookie-client.ts` + `session.server.ts` all build on it. Keeping it pure
// (Finding #23) is what lets the parser be unit-tested without booting Start.
//
// DUAL-TOKEN COOKIE FORMAT (copied verbatim from
// apps/front/src/lib/cookies/session-cookie.utils.ts):
//   `s:${staffToken}`            staff (not impersonating)
//   `t:${tenantToken}`           tenant
//   `s:${staffToken}+t:${imp}`   staff impersonating (delimiter `+`)
//   legacy raw (no s:/t: prefix) = tenant token
// =============================================================================

/** Parsed session tokens from a cookie value. */
export type ParsedSessionTokens = {
	staffToken?: string;
	tenantToken?: string;
};

/**
 * Parses a session cookie VALUE (the raw token string, not the full Cookie header)
 * into staff/tenant tokens. Legacy (no prefix) values are treated as tenant tokens.
 */
export const parseSessionCookie = (
	cookieValue: string,
): ParsedSessionTokens => {
	const result: ParsedSessionTokens = {};

	const normalizedCookieValue = cookieValue.trim();
	const isDualTokenFormat =
		normalizedCookieValue.startsWith('s:') ||
		normalizedCookieValue.startsWith('t:');

	// Legacy format (no s:/t: prefix) = tenant token; empty → undefined.
	if (!isDualTokenFormat) {
		return { tenantToken: normalizedCookieValue || undefined };
	}

	for (const part of normalizedCookieValue.split('+')) {
		if (part.startsWith('s:')) {
			result.staffToken = part.slice(2) || undefined;
		} else if (part.startsWith('t:')) {
			result.tenantToken = part.slice(2) || undefined;
		}
	}

	return result;
};

/**
 * Formats parsed tokens back into a cookie VALUE string.
 */
export const formatSessionCookie = (tokens: ParsedSessionTokens): string => {
	const parts: string[] = [];
	if (tokens.staffToken) parts.push(`s:${tokens.staffToken}`);
	if (tokens.tenantToken) parts.push(`t:${tokens.tenantToken}`);
	return parts.join('+');
};

/**
 * Extracts the session tokens from a FULL `Cookie` request header (multi-cookie,
 * url-encoded values supported). Used server-side where `getRequestHeader('cookie')`
 * returns the whole header — NOT the raw token value (R4-B1). Missing → `{}`.
 */
export const getSessionTokensFromCookieHeader = (
	cookieHeader: string | undefined,
): ParsedSessionTokens => {
	const raw = parseCookieHeader(cookieHeader ?? '')[SESSION_TOKEN_COOKIE_KEY];
	return raw ? parseSessionCookie(raw) : {};
};
