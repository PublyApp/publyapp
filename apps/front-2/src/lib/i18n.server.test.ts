import { describe, expect, test } from 'vitest';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { buildI18nResources, resolveLocaleFromCookie } from './i18n.server';

const makeCookie = (value: string | undefined): string => {
	if (!value) {
		return '';
	}

	return `${LOCALE_COOKIE_KEY}=${value}`;
};

describe('i18n.server', () => {
	test('resolves French locale from cookie', () => {
		expect(resolveLocaleFromCookie(makeCookie('fr'))).toBe('fr');
	});

	test('falls back to English when locale is unsupported', () => {
		expect(resolveLocaleFromCookie(makeCookie('de'))).toBe('en');
	});

	test('buildI18nResources loads requested locale with English fallback', async () => {
		const resources = await buildI18nResources('fr');
		expect(Object.keys(resources)).toContain('fr');
		expect(Object.keys(resources)).toContain('en');
		expect(resources.fr).toBeTruthy();
		expect(resources.en).toBeTruthy();
	});
});
