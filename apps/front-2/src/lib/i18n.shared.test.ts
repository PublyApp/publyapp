import { describe, expect, test } from 'vitest';

import { createI18nFromResources } from './i18n.shared';

describe('createI18nFromResources', () => {
	test('initializes synchronously from only the active language', () => {
		const i18n = createI18nFromResources('fr', ['common'], {
			fr: { common: { hello: 'Bonjour' } },
		});
		expect(i18n.isInitialized).toBe(true);
		expect(i18n.t('hello')).toBe('Bonjour');
		expect(Object.keys(i18n.store.data)).toEqual(['fr']);
	});

	test('does not fall back to English', () => {
		const i18n = createI18nFromResources('fr', ['common'], {
			fr: { common: {} },
			en: { common: { englishOnly: 'must not render' } },
		});
		expect(i18n.t('englishOnly')).toBe('englishOnly');
		expect(i18n.options.fallbackLng).toBe(false);
	});
});
