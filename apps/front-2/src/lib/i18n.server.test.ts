import { describe, expect, test } from 'vitest';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { FALLBACK_LANGUAGE, createI18nFromResources } from './i18n.shared';
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

	test('resolves French translation and falls back to English', async () => {
		const resources = await buildI18nResources('fr');
		const i18n = await createI18nFromResources('fr', resources);

		expect(i18n.t('common:hello')).toBe('Bonjour');
		expect(i18n.t('common:hello', { lng: FALLBACK_LANGUAGE })).toBe('Hello');
	});
});
