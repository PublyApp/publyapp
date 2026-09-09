import { describe, expect, test } from 'vitest';
import en from '~/i18n/locales/en';
import fr from '~/i18n/locales/fr';

import { publicationStatusPresentation } from './publication-status';

const EXPECTED_STATUS_KEYS = {
	scheduled: 'posts:publish-status-scheduled',
	in_progress: 'posts:publish-status-in-progress',
	paused: 'posts:publish-status-paused',
	published: 'posts:publish-status-published',
	failed: 'posts:publish-status-failed',
} as const;

describe('publicationStatusPresentation', () => {
	test('uses the posts namespace for every status label in both locales', () => {
		const enPosts: Record<string, string> = en.posts;
		const frPosts: Record<string, string> = fr.posts;

		for (const [status, expectedKey] of Object.entries(EXPECTED_STATUS_KEYS)) {
			const presentation = publicationStatusPresentation(status);
			const resourceKey = expectedKey.slice('posts:'.length);

			expect(presentation?.labelKey).toBe(expectedKey);
			expect(enPosts[resourceKey]).toBeTruthy();
			expect(frPosts[resourceKey]).toBeTruthy();
		}
	});
});
