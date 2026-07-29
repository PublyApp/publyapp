import { describe, expect, test } from 'vitest';
import type { StaffTenantPermissionGroup } from '~/lib/query/staff-tenant-profiles';

import { buildProfilePermissionGlance } from './_profile-overview-data';

const group = (
	moduleKey: string,
	moduleLabel: string,
	keys: string[],
): StaffTenantPermissionGroup => ({
	moduleKey,
	moduleLabel,
	options: keys.map((key) => ({ key, label: key, description: null })),
});

const catalog: StaffTenantPermissionGroup[] = [
	group('users', 'Users', ['tenant.users.read', 'tenant.users.write']),
	group('posts', 'Posts', [
		'tenant.posts.read',
		'tenant.posts.write',
		'tenant.posts.publish',
	]),
	group('billing', 'Billing', ['tenant.billing.view']),
];

describe('buildProfilePermissionGlance', () => {
	test('computes K/T and modules-with-access (M/MT) from granted keys', () => {
		const glance = buildProfilePermissionGlance(catalog, [
			'tenant.users.read',
			'tenant.posts.read',
			'tenant.posts.write',
		]);

		// K = granted keys present in the catalog, T = total catalog keys.
		expect(glance.grantedTotal).toBe(3);
		expect(glance.catalogTotal).toBe(6);
		// M = modules with ≥1 granted key (users + posts), MT = all modules.
		expect(glance.modulesWithAccess).toBe(2);
		expect(glance.totalModules).toBe(3);
	});

	test('counts granted/total per module without exposing individual options', () => {
		const glance = buildProfilePermissionGlance(catalog, ['tenant.users.read']);
		const users = glance.modules.find((module) => module.moduleKey === 'users');

		expect(users?.grantedCount).toBe(1);
		expect(users?.totalCount).toBe(2);
		expect(users).not.toHaveProperty('options');
	});

	test('modulesWithAccess counts every module once every module has a grant, and the old footer-only field is gone', () => {
		const glance = buildProfilePermissionGlance(catalog, [
			'tenant.users.read',
			'tenant.posts.read',
			'tenant.billing.view',
		]);

		expect(glance.modulesWithAccess).toBe(3);
		// review-ui-fidelity.md MINOR: this test previously only asserted an
		// aggregate invariant unchanged by this batch. `zeroAccessModuleLabels`
		// fed the old "No access to …" footer, which the glance card no
		// longer renders — it must not survive as dead computed data.
		expect(glance).not.toHaveProperty('zeroAccessModuleLabels');
	});

	test('ignores granted keys that are not in the catalog (honest K)', () => {
		const glance = buildProfilePermissionGlance(catalog, [
			'tenant.users.read',
			'tenant.ghost.removed',
		]);

		expect(glance.grantedTotal).toBe(1);
	});

	test('handles an empty catalog without inflating totals', () => {
		const glance = buildProfilePermissionGlance([], ['tenant.users.read']);

		expect(glance.grantedTotal).toBe(0);
		expect(glance.catalogTotal).toBe(0);
		expect(glance.totalModules).toBe(0);
		expect(glance.modules).toEqual([]);
	});
});
