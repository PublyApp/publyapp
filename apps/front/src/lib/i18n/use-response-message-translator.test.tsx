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
import { createI18nFromResources } from '~/lib/i18n/react-i18n';

import type { SupportedLanguage } from '@org/shared-ts/lib/i18n/shared';

import { useResponseMessageTranslator } from './use-response-message-translator';

const translatorFor = (
	language: SupportedLanguage,
	responseMessageOverrides: Record<string, string> = {},
) => {
	const resource = language === 'en' ? resourceEN : resourceFR;
	const i18n = createI18nFromResources(
		language,
		['response-message', 'posts', 'common'],
		{
			[language]: {
				common: resource.common,
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

// The staff upload routes load only the global namespaces (no `posts`): the
// too-large sentence must resolve there, never as a raw key (#2421).
const globalOnlyTranslatorFor = (language: SupportedLanguage) => {
	const resource = language === 'en' ? resourceEN : resourceFR;
	const i18n = createI18nFromResources(
		language,
		['common', 'response-message'],
		{
			[language]: {
				common: resource.common,
				'response-message': resource['response-message'],
			},
		},
	);
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(I18nextProvider, { i18n }, children);
	return renderHook(() => useResponseMessageTranslator(), { wrapper }).result
		.current;
};

describe('useResponseMessageTranslator with only the global namespaces', () => {
	test.each([
		['en', 'The image exceeds the 1 MB limit.'],
		['fr', 'L’image dépasse la taille maximale de 1 Mo.'],
	] as const)(
		'resolves the too-large sentence in %s, not a key',
		(language, expected) => {
			const translate = globalOnlyTranslatorFor(language);

			expect(translate('upload-file-too-large', { maxBytes: 1_000_000 })).toBe(
				expected,
			);
		},
	);
});

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
		['provider-disabled', 'Ce fournisseur est désactivé'],
		['post-segment-not-found', 'segment'],
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

	test('builds the publish-time provider-disabled refusal in French from the structured provider name', () => {
		const translate = translatorFor('fr');

		expect(translate('publish-provider-disabled', {})).toBeUndefined();
		expect(
			translate('publish-provider-disabled', { providerLabel: 'Bluesky' }),
		).toContain("Bluesky est désactivé par l'opérateur");
		expect(translate('provider-disabled', {})).toContain(
			'Ce fournisseur est désactivé',
		);
	});

	test('names the empty follow-up by its number, and keeps the detail without one', () => {
		const translate = translatorFor('fr');

		expect(translate('post-segment-blank', { segmentNumber: 3 })).toContain(
			'Le segment 3 est vide',
		);
		expect(translate('post-segment-blank', {})).toBeUndefined();
	});

	test('names the follow-up image limit it was given, and keeps the detail without one', () => {
		const translate = translatorFor('fr');

		expect(
			translate('post-segment-image-limit-reached', { limit: 4 }),
		).toContain('au plus 4 images');
		expect(translate('post-segment-image-limit-reached', {})).toBeUndefined();
	});

	test('names the image size limit in Mo from maxBytes, never a raw byte count', () => {
		const translate = translatorFor('fr');

		const message = translate('post-image-too-large', { maxBytes: 16_777_216 });
		expect(translate('upload-file-too-large', { maxBytes: 16_777_216 })).toBe(
			message,
		);
		expect(message).toMatch(/16,7\sMo/);
		expect(message).not.toContain('16777216');
		expect(translate('post-image-too-large', {})).toBeUndefined();
	});

	test('a translation that still has placeholders is treated as untranslated', () => {
		const translate = translatorFor('fr', {
			'post-segments-locked': 'Le segment {{index}} est verrouillé',
		});

		expect(translate('post-segments-locked', {})).toBeUndefined();
	});
});

describe('useResponseMessageTranslator in English', () => {
	test.each(['post-image-too-large', 'upload-file-too-large'])(
		'%s names the size limit from maxBytes, floored like the add-row help',
		(key) => {
			const translate = translatorFor('en');

			expect(translate(key, { maxBytes: 16_777_216 })).toBe(
				'The image exceeds the 16.7 MB limit.',
			);
			expect(translate(key, {})).toBeUndefined();
		},
	);

	test.each([
		['post-segment-blank', { segmentNumber: 3 }],
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
