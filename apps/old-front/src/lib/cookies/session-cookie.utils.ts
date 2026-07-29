import * as cookie from 'cookie';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

// ============================================================================
// DUAL TOKEN COOKIE FORMAT
// ============================================================================
// Cookie format: `s:${staffToken}` and/or `+t:${tenantToken}`
//
// Examples:
//   - Non-staff user: `t:${tenantToken}`
//   - Staff user (not impersonating): `s:${staffToken}`
//   - Staff user impersonating: `s:${staffToken}+t:${impersonationToken}`
//
// Delimiter: `+` separates tokens
// Prefixes: `s:` = staff, `t:` = tenant
// ============================================================================

/**
 * Parsed session tokens from cookie.
 */
export type ParsedSessionTokens = {
	staffToken?: string;
	tenantToken?: string;
};

/**
 * Parses a session cookie value into staff and tenant tokens.
 *
 * Supports both legacy format (raw token) and new dual-token format.
 * Legacy cookies (no prefix) are treated as tenant tokens for backward compatibility.
 */
export function parseSessionCookie(cookieValue: string): ParsedSessionTokens {
	const result: ParsedSessionTokens = {};

	const normalizedCookieValue = cookieValue.trim();
	const isDualTokenFormat =
		normalizedCookieValue.startsWith('s:') ||
		normalizedCookieValue.startsWith('t:');

	// Legacy format (no s:/t: prefix) = tenant token
	// Normalize empty strings to undefined
	if (!isDualTokenFormat) {
		return { tenantToken: normalizedCookieValue || undefined };
	}

	for (const part of normalizedCookieValue.split('+')) {
		if (part.startsWith('s:')) {
			// Normalize empty strings to undefined (e.g., s: with no value)
			result.staffToken = part.slice(2) || undefined;
		} else if (part.startsWith('t:')) {
			result.tenantToken = part.slice(2) || undefined;
		}
	}

	return result;
}

/**
 * Formats parsed tokens back into cookie value string.
 */
export function formatSessionCookie(tokens: ParsedSessionTokens): string {
	const parts: string[] = [];
	if (tokens.staffToken) parts.push(`s:${tokens.staffToken}`);
	if (tokens.tenantToken) parts.push(`t:${tokens.tenantToken}`);
	return parts.join('+');
}

/**
 * Gets parsed session tokens from client-side cookie.
 * Returns empty object if cookie doesn't exist.
 */
export function getSessionTokensFromClient(): ParsedSessionTokens {
	const browserCookies = cookie.parse(document.cookie);
	const rawValue = browserCookies[SESSION_TOKEN_COOKIE_KEY];
	if (!rawValue) return {};
	return parseSessionCookie(rawValue);
}

/**
 * Clears non-httpOnly session token cookies from the client.
 *
 * IMPORTANT: This function can ONLY clear non-httpOnly cookies.
 * JavaScript cannot access or modify httpOnly cookies - browsers completely
 * ignore the httpOnly flag when set via document.cookie.
 *
 * For httpOnly cookies, use server-side clearing via Set-Cookie headers
 * (see createClearSessionCookieHeaders in server-cookie.utils.ts).
 *
 * This function tries multiple path combinations to ensure removal of cookies
 * that may have been set with different path attributes.
 *
 * Domain behavior: The 'domain' attribute is intentionally omitted, using the
 * default host-only cookie behavior to match how session cookies are set.
 */
export function clearSessionCookie(): void {
	const clearCookieOptions = [
		// Clear cookie with path='/'
		{ path: '/', expires: new Date(0), maxAge: 0 },
		// Clear cookie without path (current path)
		{ expires: new Date(0), maxAge: 0 },
	];

	clearCookieOptions.forEach((options) => {
		try {
			document.cookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', options);
		} catch {
			// Ignore errors - this is defensive cleanup
		}
	});
}

/**
 * Gets the primary session token from client-side cookie.
 * Returns tenant token if available, otherwise staff token.
 *
 * This is a backward-compatible wrapper that returns a single token
 * for code that doesn't need to distinguish between staff/tenant contexts.
 */
export function getSessionCookieFromClient(): string | undefined {
	const tokens = getSessionTokensFromClient();
	return tokens.tenantToken ?? tokens.staffToken;
}
