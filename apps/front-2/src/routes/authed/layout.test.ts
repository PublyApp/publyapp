import { describe, expect, test } from 'vitest';

import { shouldLogoutForFailure } from './layout';

describe('shouldLogoutForFailure', () => {
	test('returns true for problem 401 failures', () => {
		const error = {
			kind: 'problem',
			status: 401,
			translationKey: 'auth-invalid-session',
			detail: 'Unauthorized',
			title: 'Unauthorized',
		} as const;

		expect(shouldLogoutForFailure(error)).toBe(true);
	});

	test('returns false for non-401 failures', () => {
		const error403 = {
			kind: 'problem',
			status: 403,
			translationKey: 'forbidden',
			detail: 'Forbidden',
			title: 'Forbidden',
		} as const;

		expect(shouldLogoutForFailure(error403)).toBe(false);
	});

	test('returns true for Response 401 and false for Response 403', () => {
		expect(shouldLogoutForFailure(new Response(null, { status: 401 }))).toBe(true);
		expect(shouldLogoutForFailure(new Response(null, { status: 403 }))).toBe(false);
	});
});
