import { describe, expect, test } from 'vitest';

import { shouldLogoutForFailure } from './should-logout-for-failure';

describe('shouldLogoutForFailure', () => {
	test('is true for a 401 problem failure', () => {
		expect(
			shouldLogoutForFailure({
				responseStatusCode: 401,
				title: 'Unauthorized',
			}),
		).toBe(true);
	});

	test('is false for a 403 problem failure', () => {
		expect(
			shouldLogoutForFailure({ responseStatusCode: 403, title: 'Forbidden' }),
		).toBe(false);
	});

	test('is true for a 401 Response', () => {
		expect(shouldLogoutForFailure(new Response(null, { status: 401 }))).toBe(
			true,
		);
	});

	test('is false for a 403 Response', () => {
		expect(shouldLogoutForFailure(new Response(null, { status: 403 }))).toBe(
			false,
		);
	});
});
