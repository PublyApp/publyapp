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
			publicationFailurePresentation('failed', category)?.primaryAction,
		).toBe(action);
	});

	test('is null for statuses that did not fail', () => {
		for (const status of ['scheduled', 'in_progress', 'published', null]) {
			expect(publicationFailurePresentation(status, 'unknown')).toBeNull();
		}
	});

	test('falls back per status when the category is absent or drifted', () => {
		expect(publicationFailurePresentation('failed', null)?.primaryAction).toBe(
			'retry',
		);
		expect(
			publicationFailurePresentation('paused', 'weird')?.primaryAction,
		).toBe('reconnect');
	});
});

describe('retryAvailability', () => {
	const base = {
		status: 'failed',
		accountNeedsReconnect: false,
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

	test('a paused row waits for the account, a failed row does not', () => {
		expect(
			retryAvailability({
				...base,
				status: 'paused',
				accountNeedsReconnect: true,
			}),
		).toEqual({
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-reconnect',
		});
		expect(
			retryAvailability({ ...base, accountNeedsReconnect: true }).enabled,
		).toBe(true);
	});

	test('requires publish permissions', () => {
		expect(retryAvailability({ ...base, canPublish: false })).toEqual({
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-permission',
		});
	});
});
