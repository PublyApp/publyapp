/**
 * @vitest-environment jsdom
 */
// #2209: a backend `translationKey` resolves in the active locale against the
// REAL shipped `response-message` bundles; a key the locale lacks resolves to
// undefined so the caller falls back to the API's English `detail`.
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, test } from 'vitest';
import resourceEN from '~/i18n/locales/en';
import resourceFR from '~/i18n/locales/fr';
import { createI18nFromResources } from '~/lib/i18n/shared';
import type { SupportedLanguage } from '~/lib/i18n/shared';

import { useResponseMessageTranslator } from './use-response-message-translator';

const translatorFor = (language: SupportedLanguage) => {
	const i18n = createI18nFromResources(language, ['response-message'], {
		[language]: {
			'response-message': (language === 'en' ? resourceEN : resourceFR)[
				'response-message'
			],
		},
	});
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(I18nextProvider, { i18n }, children);
	return renderHook(() => useResponseMessageTranslator(), { wrapper }).result
		.current;
};

describe('useResponseMessageTranslator', () => {
	test.each([
		['publication-rendition-locked', 'Cette publication est déjà publiée'],
		['post-segments-locked', 'Les segments déjà publiés'],
		['publication-rendition-superseded', 'Une publication plus récente'],
	])('resolves %s in French', (key, start) => {
		expect(translatorFor('fr')(key)).toContain(start);
	});

	test('resolves in English too', () => {
		expect(translatorFor('en')('post-segments-locked')).toBe(
			'Segments that are already published cannot be changed or removed',
		);
	});

	test('an unknown key resolves to undefined', () => {
		expect(
			translatorFor('fr')('a-key-the-bundle-does-not-have'),
		).toBeUndefined();
	});
});
