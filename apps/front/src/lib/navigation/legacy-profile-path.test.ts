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
	test('legacyProfileRedirectHref maps the old paths and leaves the rest alone', () => {
		expect(legacyProfileRedirectHref('/staff/profiles')).toBe('/staff/roles');
		expect(legacyProfileRedirectHref('/staff/profiles/0190a-role/users')).toBe(
			'/staff/roles/0190a-role/users',
		);
		expect(
			legacyProfileRedirectHref('/staff/tenants/t-1/profiles/0190a-role'),
		).toBe('/staff/tenants/t-1/roles/0190a-role');
		expect(legacyProfileRedirectHref('/staff/roles')).toBeUndefined();
		expect(
			legacyProfileRedirectHref('/tenant/account/profile'),
		).toBeUndefined();
	});

	test('every legacy route redirects to the renamed URL with a 301', () => {
		const cases: Array<[unknown, string, string]> = [
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
		];

		mocks.redirect.mockClear();
		for (const [route, from, to] of cases) {
			expect(() =>
				beforeLoadOf(route)({ location: { pathname: from } }),
			).toThrow();
			expect(mocks.redirect).toHaveBeenCalledWith({
				href: to,
				statusCode: 301,
			});
		}
	});
});
