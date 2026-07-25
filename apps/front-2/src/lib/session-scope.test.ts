import { describe, expect, test } from 'vitest';

import {
	determineServerSessionAction,
	determineSessionScope,
	determineSessionToken,
} from './session-scope';

describe('determineServerSessionAction', () => {
	test('redirects only when the session cookie is absent', () => {
		expect(determineServerSessionAction(undefined)).toBe('redirect-login');
	});

	test.each([
		['forged staff token', 's:forged'],
		['forged tenant token', 't:forged'],
		['forged dual-scope hints', 's:forged-staff+t:forged-tenant'],
		['expired token', 's:expired'],
		['empty scoped token', 's:'],
		['malformed scoped pair', 's:forged+t:'],
		['raw legacy value', 'forged-legacy'],
		['empty cookie value', ''],
	])('keeps %s neutral instead of treating it as authenticated', (_, value) => {
		expect(determineServerSessionAction(value)).toBe('neutral');
	});
});

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
