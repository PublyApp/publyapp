import { describe, expect, test } from 'vitest';

import {
	publicationFailurePresentation,
	retryAvailability,
} from './publication-failure';

describe('publicationFailurePresentation', () => {
	test.each([
		['reconnect', 'reconnect'],
		['fix_content', 'edit'],
		['retry_later', 'retry'],
		['unknown', 'retry'],
	])('%s maps to one primary action (%s)', (category, action) => {
		expect(
			publicationFailurePresentation('failed', category, true)?.primaryAction,
		).toBe(action);
	});

	test('is null for statuses that did not fail', () => {
		for (const status of ['scheduled', 'in_progress', 'published', null]) {
			expect(
				publicationFailurePresentation(status, 'unknown', true),
			).toBeNull();
		}
	});

	test('falls back per status when the category is absent or drifted', () => {
		expect(
			publicationFailurePresentation('failed', null, true)?.primaryAction,
		).toBe('retry');
		expect(
			publicationFailurePresentation('paused', 'weird', true)?.primaryAction,
		).toBe('reconnect');
	});
});

describe('retryAvailability', () => {
	const base = {
		status: 'failed',
		accountUsable: true,
		superseded: false,
		canPublish: true,
	};

	test('enabled for failed and paused rows', () => {
		expect(retryAvailability(base).enabled).toBe(true);
		expect(retryAvailability({ ...base, status: 'paused' }).enabled).toBe(true);
	});

	test('disabled with a reason for every other status', () => {
		for (const status of ['scheduled', 'in_progress', 'published', null]) {
			expect(retryAvailability({ ...base, status })).toEqual({
				enabled: false,
				reasonKey: 'posts:publication-retry-disabled-status',
			});
		}
	});

	test('any row of an unusable account waits for a reconnect', () => {
		for (const status of ['paused', 'failed']) {
			expect(
				retryAvailability({ ...base, status, accountUsable: false }),
			).toEqual({
				enabled: false,
				reasonKey: 'posts:publication-retry-disabled-reconnect',
			});
		}
	});

	test('a superseded row cannot be retried', () => {
		expect(retryAvailability({ ...base, superseded: true })).toEqual({
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-superseded',
		});
	});

	test('retry-style categories switch to the reconnect action on an unusable account', () => {
		expect(
			publicationFailurePresentation('failed', 'retry_later', false)
				?.primaryAction,
		).toBe('reconnect');
		expect(
			publicationFailurePresentation('failed', 'fix_content', false)
				?.primaryAction,
		).toBe('edit');
	});

	test('requires publish permissions', () => {
		expect(retryAvailability({ ...base, canPublish: false })).toEqual({
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-permission',
		});
	});
});
