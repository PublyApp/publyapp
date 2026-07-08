import { describe, expect, test } from 'vitest';

import {
	getActiveAppRoute,
	getBreadcrumbsForPath,
	getShellDisplayMode,
	PRIMARY_APP_ROUTES,
} from './route-metadata';

describe('front-2 route metadata', () => {
	test('exposes icon-backed primary routes without short text labels', () => {
		expect(PRIMARY_APP_ROUTES.map((route) => route.label)).toEqual([
			'Staff users',
			'Profiles',
			'Tenants',
		]);
		expect(PRIMARY_APP_ROUTES.every((route) => route.Icon)).toBe(true);
		expect(PRIMARY_APP_ROUTES.some((route) => 'shortLabel' in route)).toBe(
			false,
		);
	});

	test('matches nested staff-user details to the Staff users route', () => {
		expect(getActiveAppRoute('/staff/staff-users/abc')?.path).toBe(
			'/staff/staff-users',
		);
	});

	test('builds breadcrumbs for a list and a detail path', () => {
		expect(getBreadcrumbsForPath('/staff/staff-users')).toEqual([
			{ label: 'Workspace', path: '/staff/staff-users' },
			{ label: 'Staff users', path: '/staff/staff-users' },
		]);
		expect(getBreadcrumbsForPath('/staff/staff-users/u-1')).toEqual([
			{ label: 'Workspace', path: '/staff/staff-users' },
			{ label: 'Staff users', path: '/staff/staff-users' },
			{ label: 'User detail' },
		]);
	});

	test('collapses secondary chrome on full-detail routes', () => {
		expect(getShellDisplayMode('/staff/staff-users/u-1')).toBe('full-detail');
		expect(getShellDisplayMode('/staff/staff-users')).toBe('default');
	});

	test('keeps known create routes in the default shell mode', () => {
		expect(getShellDisplayMode('/staff/tenants/new')).toBe('default');
		expect(getShellDisplayMode('/staff/profiles/new')).toBe('default');
		expect(getShellDisplayMode('/staff/invitations/new')).toBe('default');
	});

	test('breadcrumbs for invitation detail use "Invitation detail"', () => {
		const crumbs = getBreadcrumbsForPath('/staff/invitations/i-1');
		expect(crumbs[crumbs.length - 1]).toEqual({ label: 'Invitation detail' });
	});

	test('shell display mode for staff/invitations list vs detail', () => {
		expect(getShellDisplayMode('/staff/invitations')).toBe('default');
		expect(getShellDisplayMode('/staff/invitations/i-1')).toBe('full-detail');
	});

	test('negative prefix matching avoids spurious route activation', () => {
		expect(getActiveAppRoute('/staff/staff-usersXYZ')).toBeUndefined();
		expect(getActiveAppRoute('/staff/tenants-archive')).toBeUndefined();
	});

	test('tenant secondary prefix resolves to the tenants route', () => {
		expect(getActiveAppRoute('/tenant')?.path).toBe('/staff/tenants');
	});

	test('shell display mode for tenant secondary prefix', () => {
		expect(getShellDisplayMode('/tenant')).toBe('default');
		expect(getShellDisplayMode('/tenant/settings')).toBe('full-detail');
	});

	test('nested create routes use default shell mode', () => {
		expect(getShellDisplayMode('/staff/tenants/t-1/profiles/new')).toBe(
			'default',
		);
		expect(getShellDisplayMode('/staff/tenants/t-1/users/invite')).toBe(
			'default',
		);
	});
});
