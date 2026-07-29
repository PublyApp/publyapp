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

	test('marks each option granted/ungranted and counts per module', () => {
		const glance = buildProfilePermissionGlance(catalog, ['tenant.users.read']);
		const users = glance.modules.find((module) => module.moduleKey === 'users');

		expect(users?.grantedCount).toBe(1);
		expect(users?.totalCount).toBe(2);
		expect(users?.options).toEqual([
			{ key: 'tenant.users.read', label: 'tenant.users.read', granted: true },
			{
				key: 'tenant.users.write',
				label: 'tenant.users.write',
				granted: false,
			},
		]);
	});

	test('lists zero-granted module labels for the glance footer', () => {
		const glance = buildProfilePermissionGlance(catalog, ['tenant.users.read']);

		expect(glance.zeroAccessModuleLabels).toEqual(['Posts', 'Billing']);
	});

	test('returns no zero-access labels when every module has a grant', () => {
		const glance = buildProfilePermissionGlance(catalog, [
			'tenant.users.read',
			'tenant.posts.read',
			'tenant.billing.view',
		]);

		expect(glance.zeroAccessModuleLabels).toEqual([]);
		expect(glance.modulesWithAccess).toBe(3);
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
