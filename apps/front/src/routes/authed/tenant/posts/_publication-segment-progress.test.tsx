/**
 * @vitest-environment jsdom
 */
// #2209: the History thread progress label ("1 segments publiés sur 2") ran
// the count through a single form. It runs against the REAL shipped bundles
// through the production init helper, so the singular/plural forms are pinned
// per language (the same pattern as data-table-range-label.test.tsx).
import { cleanup, render } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, test } from 'vitest';
import resourceEN from '~/i18n/locales/en/posts.json';
import resourceFR from '~/i18n/locales/fr/posts.json';
import {
	createI18nFromResources,
	type SupportedLanguage,
} from '~/lib/i18n/shared';

import { PublicationSegmentProgress } from './_publication-segment-progress';

afterEach(cleanup);

const createI18n = (language: SupportedLanguage): I18nInstance =>
	createI18nFromResources(language, ['posts'], {
		[language]: { posts: language === 'en' ? resourceEN : resourceFR },
	});

const labelOf = (
	language: SupportedLanguage,
	props: { status: string; published: number; total: number },
) => {
	const view = render(
		createElement(
			I18nextProvider,
			{ i18n: createI18n(language) },
			createElement(PublicationSegmentProgress, props),
		),
	);
	return view.getByTestId('tenant-posts-history-segments').textContent;
};

describe('PublicationSegmentProgress label', () => {
	test.each([
		[0, '0 segment publié sur 3'],
		[1, '1 segment publié sur 3'],
		[2, '2 segments publiés sur 3'],
	])('French agrees with the published count (%i)', (published, expected) => {
		expect(labelOf('fr', { status: 'failed', published, total: 3 })).toContain(
			expected,
		);
	});

	test('French reads "1 segment publié sur 2" for the first segment of a pair', () => {
		expect(
			labelOf('fr', { status: 'failed', published: 1, total: 2 }),
		).toContain('1 segment publié sur 2');
	});

	test('English keeps "Published N of M segments"', () => {
		expect(
			labelOf('en', { status: 'failed', published: 1, total: 3 }),
		).toContain('Published 1 of 3 segments');
	});
});
