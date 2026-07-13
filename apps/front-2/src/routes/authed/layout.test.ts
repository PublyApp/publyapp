import { describe, expect, test } from 'vitest';

import { determineSessionToken, shouldLogoutForFailure } from './layout';

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
		expect(shouldLogoutForFailure(new Response(null, { status: 401 }))).toBe(
			true,
		);
		expect(shouldLogoutForFailure(new Response(null, { status: 403 }))).toBe(
			false,
		);
	});
});

describe('determineSessionToken', () => {
	test('picks the staff token on a /staff path', () => {
		expect(
			determineSessionToken(
				{ staffToken: 'staff-tok', tenantToken: 'tenant-tok' },
				'/staff/staff-users',
			),
		).toEqual({ token: 'staff-tok' });
	});

	test('redirects a tenant-only session away from a /staff path', () => {
		expect(
			determineSessionToken({ tenantToken: 'tenant-tok' }, '/staff/profiles'),
		).toEqual({ token: undefined, redirectPath: '/tenant' });
	});

	test('picks the tenant token on a /tenant path', () => {
		expect(
			determineSessionToken(
				{ staffToken: 'staff-tok', tenantToken: 'tenant-tok' },
				'/tenant',
			),
		).toEqual({ token: 'tenant-tok' });
	});

	test('redirects a staff-only session away from a /tenant path', () => {
		expect(
			determineSessionToken({ staffToken: 'staff-tok' }, '/tenant'),
		).toEqual({ token: undefined, redirectPath: '/staff' });
	});

	test('has no token at all on a scoped path — no redirect, caller sends to login', () => {
		expect(determineSessionToken({}, '/staff/profiles')).toEqual({
			token: undefined,
		});
		expect(determineSessionToken({}, '/tenant')).toEqual({ token: undefined });
	});

	test('picks whichever token exists for a path outside both surfaces', () => {
		expect(determineSessionToken({ staffToken: 'staff-tok' }, '/')).toEqual({
			token: 'staff-tok',
		});
		expect(determineSessionToken({ tenantToken: 'tenant-tok' }, '/')).toEqual({
			token: 'tenant-tok',
		});
	});
});
