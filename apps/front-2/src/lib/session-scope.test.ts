import { describe, expect, test } from 'vitest';

import { determineSessionScope, determineSessionToken } from './session-scope';

describe('determineSessionScope', () => {
	test('leaves a missing session for the caller to route to login', () => {
		expect(
			determineSessionScope(
				{ staff: false, tenant: false },
				'/staff/staff-users',
			),
		).toEqual({});
	});

	test('keeps matching scopes and redirects cross-scope sessions', () => {
		expect(
			determineSessionScope(
				{ staff: true, tenant: false },
				'/staff/staff-users',
			),
		).toEqual({ scope: 'staff' });
		expect(
			determineSessionScope(
				{ staff: false, tenant: true },
				'/staff/staff-users',
			),
		).toEqual({ redirectPath: '/tenant' });
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

	test('leaves a tokenless scoped request for the caller to route to login', () => {
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
