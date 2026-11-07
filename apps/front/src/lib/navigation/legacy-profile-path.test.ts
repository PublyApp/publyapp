/**
 * @vitest-environment jsdom
 *
 * #2290: the permission-group surface moved from `…/profiles` to `…/roles`.
 * Every old URL must keep working for people who bookmarked it, so each
 * legacy path is a frozen `beforeLoad`-only stub that 301s to the new URL.
 */
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	redirect: vi.fn((options: unknown) => options),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	redirect: mocks.redirect,
}));

import { legacyProfileRedirectHref } from '~/lib/navigation/legacy-profile-path';
import { Route as StaffProfiles } from '~/routes/authed/staff/_legacy-profile-redirects/staff-profiles';
import { Route as StaffProfilesSplat } from '~/routes/authed/staff/_legacy-profile-redirects/staff-profiles-splat';
import { Route as TenantProfiles } from '~/routes/authed/staff/_legacy-profile-redirects/tenant-profiles';
import { Route as TenantProfilesSplat } from '~/routes/authed/staff/_legacy-profile-redirects/tenant-profiles-splat';

type BeforeLoad = (context: {
	location: { pathname: string; searchStr?: string };
}) => void;

const beforeLoadOf = (route: unknown): BeforeLoad =>
	(route as { options: { beforeLoad: BeforeLoad } }).options.beforeLoad;

describe('legacy /profiles URLs (#2290)', () => {
	test('legacyProfileRedirectHref maps the old paths and falls back to the roles root', () => {
		expect(legacyProfileRedirectHref('/staff/profiles')).toBe('/staff/roles');
		expect(legacyProfileRedirectHref('/staff/profiles/0190a-role/users')).toBe(
			'/staff/roles/0190a-role/users',
		);
		expect(
			legacyProfileRedirectHref('/staff/tenants/t-1/profiles/0190a-role'),
		).toBe('/staff/tenants/t-1/roles/0190a-role');
		expect(legacyProfileRedirectHref('/staff/roles')).toBe('/staff/roles');
		expect(legacyProfileRedirectHref('/tenant/account/profile')).toBe(
			'/staff/roles',
		);
	});

	test('keeps the query string of a bookmarked filtered list', () => {
		expect(
			legacyProfileRedirectHref(
				'/staff/tenants/t-1/profiles/0190a-role/users',
				'?page=2&q=admin',
			),
		).toBe('/staff/tenants/t-1/roles/0190a-role/users?page=2&q=admin');
		expect(legacyProfileRedirectHref('/staff/profiles', '')).toBe(
			'/staff/roles',
		);
	});

	test('every legacy route redirects to the renamed URL with a 301', () => {
		const cases: Array<[unknown, string, string, { searchStr?: string }?]> = [
			[StaffProfiles, '/staff/profiles', '/staff/roles'],
			[
				StaffProfilesSplat,
				'/staff/profiles/0190a-role/users',
				'/staff/roles/0190a-role/users',
			],
			[
				TenantProfiles,
				'/staff/tenants/t-1/profiles',
				'/staff/tenants/t-1/roles',
			],
			[
				TenantProfilesSplat,
				'/staff/tenants/t-1/profiles/0190a-role/members',
				'/staff/tenants/t-1/roles/0190a-role/members',
			],
			[
				TenantProfilesSplat,
				'/staff/tenants/t-1/profiles/0190a-role/members',
				'/staff/tenants/t-1/roles/0190a-role/members?page=2&q=admin',
				{ searchStr: '?page=2&q=admin' },
			],
		];

		mocks.redirect.mockClear();
		for (const [route, from, to, extra] of cases) {
			expect(() =>
				beforeLoadOf(route)({
					location: { pathname: from, ...extra },
				}),
			).toThrow();
			expect(mocks.redirect).toHaveBeenCalledWith({
				href: to,
				statusCode: 301,
			});
		}
	});
});
