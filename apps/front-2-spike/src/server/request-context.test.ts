/**
 * @vitest-environment jsdom
 */
import { expect, test } from 'vitest';

import {
	LOCALE_COOKIE_KEY,
	SESSION_TOKEN_COOKIE_KEY,
} from '@org/shared-ts/lib/constants';

import {
	getCookieHeaderIsomorphic,
	getLocaleFromCookieHeader,
	getSessionTokensIsomorphic,
	getThemeFromCookieHeader,
} from './request-context';

test('getSessionTokensIsomorphic reads session tokens from document.cookie in jsdom', async () => {
	document.cookie = `${SESSION_TOKEN_COOKIE_KEY}=s:staff-token+t:tenant-token`;

	const tokens = await getSessionTokensIsomorphic();

	expect(tokens).toEqual({
		staffToken: 'staff-token',
		tenantToken: 'tenant-token',
	});
});

test('getCookieHeaderIsomorphic + root cookie parsing works in jsdom without server-only throw', async () => {
	document.cookie = `${SESSION_TOKEN_COOKIE_KEY}=s:staff-token`;
	document.cookie = `${LOCALE_COOKIE_KEY}=fr`;
	document.cookie = 'publyapp-theme=dark';

	const cookieHeader = await getCookieHeaderIsomorphic();
	const initialTheme = getThemeFromCookieHeader(cookieHeader);
	const locale = getLocaleFromCookieHeader(cookieHeader);

	expect(cookieHeader).toContain('publyapp-theme=dark');
	expect(initialTheme).toBe('dark');
	expect(locale).toBe('fr');
});
