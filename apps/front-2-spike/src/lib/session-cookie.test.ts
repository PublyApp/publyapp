import { expect, test } from 'vitest';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import {
	formatSessionCookie,
	getSessionTokensFromCookieHeader,
	parseSessionCookie,
} from './session-cookie';

// Task 2.2 — the PURE session-cookie parser/formatter (no Start imports).

test('parses dual-token staff+tenant cookie', () => {
	expect(parseSessionCookie('s:AAA+t:BBB')).toEqual({
		staffToken: 'AAA',
		tenantToken: 'BBB',
	});
});

test('parses a staff-only dual-token cookie', () => {
	expect(parseSessionCookie('s:AAA')).toEqual({ staffToken: 'AAA' });
});

test('legacy raw cookie is treated as tenant token', () => {
	expect(parseSessionCookie('RAW')).toEqual({ tenantToken: 'RAW' });
});

test('roundtrips', () => {
	expect(parseSessionCookie(formatSessionCookie({ staffToken: 'S' }))).toEqual({
		staffToken: 'S',
	});
});

test('roundtrips both tokens (staff impersonating)', () => {
	const tokens = { staffToken: 'S', tenantToken: 'I' };
	expect(parseSessionCookie(formatSessionCookie(tokens))).toEqual(tokens);
});

test('extracts token from a full Cookie header (multi-cookie + url-encoded value)', () => {
	const header = `publyapp-locale=fr; ${SESSION_TOKEN_COOKIE_KEY}=${encodeURIComponent('s:AAA+t:BBB')}; other=x`;
	expect(getSessionTokensFromCookieHeader(header)).toEqual({
		staffToken: 'AAA',
		tenantToken: 'BBB',
	});
});

test('missing cookie header → empty tokens', () => {
	expect(getSessionTokensFromCookieHeader(undefined)).toEqual({});
});

test('cookie header without the session cookie → empty tokens', () => {
	expect(
		getSessionTokensFromCookieHeader('publyapp-locale=fr; other=x'),
	).toEqual({});
});
