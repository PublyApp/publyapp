/**
 * @vitest-environment jsdom
 */
// #2209: which backend `translationKey`s localize, against the REAL shipped
// bundles. Only a key whose translation is as informative as the API's English
// `detail` replaces it; a generic status key never does, and the specific 422
// for a customized destination is rebuilt from its structured members so it
// still names the destination and the segment.
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

const translatorFor = (
	language: SupportedLanguage,
	responseMessageOverrides: Record<string, string> = {},
) => {
	const resource = language === 'en' ? resourceEN : resourceFR;
	const i18n = createI18nFromResources(
		language,
		['response-message', 'posts'],
		{
			[language]: {
				'response-message': {
					...resource['response-message'],
					...responseMessageOverrides,
				},
				posts: resource.posts,
			},
		},
	);
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(I18nextProvider, { i18n }, children);
	return renderHook(() => useResponseMessageTranslator(), { wrapper }).result
		.current;
};

const RENDITION_INVALID = 'publish-rendition-invalid';

describe('useResponseMessageTranslator in French', () => {
	test.each([
		['publication-rendition-locked', 'Cette publication est déjà publiée'],
		[
			'publication-rendition-needs-review',
			'peut-être déjà chez le fournisseur',
		],
		['publication-rendition-superseded', 'Une publication plus récente'],
		['publication-rendition-conflict', 'modifié en même temps'],
		['post-segments-locked', 'Les segments déjà publiés'],
	])('translates %s, which says as much as the detail', (key, start) => {
		expect(translatorFor('fr')(key, {})).toContain(start);
	});

	test.each([
		['bad-request'],
		['unauthorized'],
		['forbidden'],
		['not-found'],
		['unprocessable-entity'],
		['internal-server-error'],
		['post-not-found'],
		['publish-content-too-long'],
	])('%s keeps the API detail instead of a generic translation', (key) => {
		expect(translatorFor('fr')(key, {})).toBeUndefined();
	});

	test.each([
		[
			'SegmentTextTooLong',
			'Bluesky : le texte personnalisé du segment 2 est trop long',
		],
		[
			'SegmentTextBlank',
			'Bluesky : le texte personnalisé du segment 2 est vide',
		],
		['SegmentOutOfRange', 'Bluesky : le segment 2 n’existe plus dans le post'],
	])(
		'builds the %s override problem naming destination and segment',
		(reason, expected) => {
			const message = translatorFor('fr')(RENDITION_INVALID, {
				reason,
				destination: 'Bluesky',
				segmentNumber: 2,
			});

			expect(message).toContain(expected);
		},
	);

	test('keeps the detail when the override problem carries no structured members', () => {
		const translate = translatorFor('fr');

		expect(translate(RENDITION_INVALID, {})).toBeUndefined();
		expect(
			translate(RENDITION_INVALID, { reason: 'SegmentTextTooLong' }),
		).toBeUndefined();
		expect(
			translate(RENDITION_INVALID, {
				reason: 'UnknownAsset',
				destination: 'Bluesky',
			}),
		).toBeUndefined();
	});

	test('a translation that still has placeholders is treated as untranslated', () => {
		const translate = translatorFor('fr', {
			'post-segments-locked': 'Le segment {{index}} est verrouillé',
		});

		expect(translate('post-segments-locked', {})).toBeUndefined();
	});
});

describe('useResponseMessageTranslator in English', () => {
	test.each([
		['publication-rendition-locked', {}],
		['post-segments-locked', {}],
		[
			RENDITION_INVALID,
			{
				reason: 'SegmentTextTooLong',
				destination: 'Bluesky',
				segmentNumber: 2,
			},
		],
	])('%s keeps the API detail, which is already English', (key, extensions) => {
		expect(translatorFor('en')(key, extensions)).toBeUndefined();
	});
});
