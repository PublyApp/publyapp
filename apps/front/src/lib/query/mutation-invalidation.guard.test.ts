// @vitest-environment node
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';

/**
 * Mutation-invalidation coherence guard (#359).
 *
 * Rule (docs/guides/front/conventions.md, "Mutation Invalidation Coherence"):
 * a module whose mutations change status / filter-relevant fields / list
 * membership must invalidate its LIST query family — and, through the same
 * prefix, the mutated entity's detail entries (the line) plus any nested
 * counters/siblings.
 *
 * This guard audits the REAL artifact, not a model of it:
 * - every audited module is imported for real;
 * - list targets are the factory's OWN `queryKey()` outputs (the exact arrays
 *   the app stores in the cache) wherever the builder is exported, otherwise
 *   the module's exported root constant composed through `scopedKey()` — the
 *   same composer the module itself uses;
 * - coverage is proven with TanStack prefix matching driven over a real
 *   QueryClient spy, i.e. the same semantics `invalidateQueries` applies at
 *   runtime.
 *
 * No source-text scanning, no shape checks, and no conforming default when a
 * module cannot be analyzed: an unreadable module fails loudly below.
 */

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: vi.fn(),
		getOrCreateTenantScopeClient: vi.fn(),
		getOrCreateClient: vi.fn(),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

const TENANT_ID = 'guard-tenant';

/** TanStack prefix semantics: candidate covers target iff it is a prefix. */
const covers = (
	candidate: readonly unknown[] | undefined,
	target: readonly unknown[],
): boolean =>
	Array.isArray(candidate) &&
	candidate.length > 0 &&
	target.length >= candidate.length &&
	candidate.every((segment, index) => Object.is(segment, target[index]));

/**
 * Captures EVERY query key the module's invalidation path hands to
 * QueryClient.invalidateQueries (helpers may invalidate several families).
 */
const capturedInvalidationKeys = async (
	invalidate: (client: QueryClient) => Promise<void> | void,
): Promise<Array<readonly unknown[]>> => {
	const client = new QueryClient();
	const spy = vi.spyOn(client, 'invalidateQueries');
	await invalidate(client);
	const calls = spy.mock.calls as Array<
		Array<{ queryKey?: readonly unknown[] }>
	>;
	const keys = calls
		.map((call) => call[0]?.queryKey)
		.filter((key): key is readonly unknown[] => Array.isArray(key));
	spy.mockRestore();
	expect(
		keys.length > 0,
		'the invalidation helper must call queryClient.invalidateQueries({ queryKey })',
	).toBe(true);
	return keys;
};

const expectListCovered = (
	moduleName: string,
	helperName: string,
	invalidated: Array<readonly unknown[]>,
	listTargets: Array<[string, readonly unknown[]]>,
): void => {
	const hit = listTargets.find(([, target]) =>
		invalidated.some((key) => covers(key, target)),
	);
	expect(
		hit,
		`${moduleName}.${helperName} invalidates ${JSON.stringify(
			invalidated,
		)}, which under TanStack prefix matching covers NONE of ${moduleName}'s list queries (${listTargets
			.map(([name, key]) => `${name} = ${JSON.stringify(key)}`)
			.join('; ')}). A status/filter/membership mutation left its list stale.`,
	).toBeDefined();
};

/** The LINE half of the rule: the mutated entity's own detail entry. */
const expectLineCovered = (
	moduleName: string,
	helperName: string,
	invalidated: Array<readonly unknown[]>,
	lineTargets: Array<[string, readonly unknown[]]>,
): void => {
	const hit = lineTargets.find(([, target]) =>
		invalidated.some((key) => covers(key, target)),
	);
	expect(
		hit,
		`${moduleName}.${helperName} invalidates ${JSON.stringify(
			invalidated,
		)}, which under TanStack prefix matching covers NONE of ${moduleName}'s detail queries (${lineTargets
			.map(([name, key]) => `${name} = ${JSON.stringify(key)}`)
			.join('; ')}). A mutation left its own row's detail view stale.`,
	).toBeDefined();
};

describe('mutation modules invalidate their list query family (#359)', () => {
	test('staff-users lifecycle mutations cover the staff-users list family', async () => {
		const mod = await import('./staff-users');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			mod.invalidateStaffUsers(client),
		);
		expectListCovered('staff-users', 'invalidateStaffUsers', invalidated, [
			// Root of the family: the factory-built list key is
			// ['staff', ...STAFF_USERS_QUERY_KEY, …variables], so anything
			// matching this root matches every filtered/cursored page of it.
			['list family root', scopedKey('staff', [...mod.STAFF_USERS_QUERY_KEY])],
		]);
	});

	test('staff-tenants lifecycle mutations cover the staff-tenants list family', async () => {
		const { invalidateAllStaffTenantScopes, STAFF_TENANTS_QUERY_KEY } =
			await import('./staff-tenants');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateAllStaffTenantScopes(client),
		);
		expectListCovered(
			'staff-tenants',
			'invalidateAllStaffTenantScopes',
			invalidated,
			[['list family root', scopedKey('staff', [...STAFF_TENANTS_QUERY_KEY])]],
		);
	});

	test('staff tenant-user lifecycle mutations cover the tenant-users list family', async () => {
		const { invalidateStaffTenantUsers, STAFF_TENANT_USERS_QUERY_KEY } =
			await import('./staff-tenant-users');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateStaffTenantUsers(client),
		);
		expectListCovered(
			'staff-tenant-users',
			'invalidateStaffTenantUsers',
			invalidated,
			[
				[
					'list family root',
					scopedKey('staff', [...STAFF_TENANT_USERS_QUERY_KEY]),
				],
			],
		);
	});

	test('staff invitation mutations cover the staff-invitations list family', async () => {
		const { invalidateStaffInvitations, STAFF_INVITATIONS_QUERY_KEY } =
			await import('./staff-invitations');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateStaffInvitations(client),
		);
		expectListCovered(
			'staff-invitations',
			'invalidateStaffInvitations',
			invalidated,
			[
				[
					'list family root',
					scopedKey('staff', [...STAFF_INVITATIONS_QUERY_KEY]),
				],
			],
		);
	});

	test('tenant invitation revoke covers the tenant invitations list family', async () => {
		const {
			invalidateStaffTenantInvitations,
			STAFF_TENANT_INVITATIONS_QUERY_KEY,
		} = await import('./staff-tenant-invitations');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateStaffTenantInvitations(client),
		);
		expectListCovered(
			'staff-tenant-invitations',
			'invalidateStaffTenantInvitations',
			invalidated,
			[
				[
					'list family root',
					scopedKey('staff', [...STAFF_TENANT_INVITATIONS_QUERY_KEY]),
				],
			],
		);
	});

	test('profile mutations cover the profiles list family', async () => {
		const { invalidateStaffProfiles, STAFF_PROFILES_QUERY_KEY } =
			await import('./staff-profiles');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateStaffProfiles(client),
		);
		expectListCovered(
			'staff-profiles',
			'invalidateStaffProfiles',
			invalidated,
			[['list family root', scopedKey('staff', [...STAFF_PROFILES_QUERY_KEY])]],
		);
	});

	test('tenant profile mutations cover the tenant-profiles list family', async () => {
		const { invalidateStaffTenantProfiles, STAFF_TENANT_PROFILES_QUERY_KEY } =
			await import('./staff-tenant-profiles');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateStaffTenantProfiles(client),
		);
		expectListCovered(
			'staff-tenant-profiles',
			'invalidateStaffTenantProfiles',
			invalidated,
			[
				[
					'list family root',
					scopedKey('staff', [...STAFF_TENANT_PROFILES_QUERY_KEY]),
				],
			],
		);
	});

	test('global tenant-user mutations cover their list/details family', async () => {
		const { invalidateGlobalTenantUsers, GLOBAL_TENANT_USERS_QUERY_KEY } =
			await import('./staff-global-tenant-users');
		const { scopedKey } = await import('@org/shared-ts/lib/query/create-hooks');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateGlobalTenantUsers(client),
		);
		expectListCovered(
			'staff-global-tenant-users',
			'invalidateGlobalTenantUsers',
			invalidated,
			[['family root', scopedKey('staff', [...GLOBAL_TENANT_USERS_QUERY_KEY])]],
		);
	});

	test('social account mutations cover the connected-accounts list key', async () => {
		const mod = await import('./social-accounts');

		const invalidated = await capturedInvalidationKeys((client) =>
			mod.invalidateSocialAccounts(client, TENANT_ID),
		);
		expectListCovered(
			'social-accounts',
			'invalidateSocialAccounts',
			invalidated,
			[
				[
					'socialAccountsQueryOptions.queryKey (real cached array)',
					mod.socialAccountsQueryOptions.queryKey({ tenantId: TENANT_ID }),
				],
			],
		);
	});

	test('post save/delete cover BOTH the posts list and the mutated post detail', async () => {
		const { TENANT_POSTS_QUERY_KEY, invalidateTenantPosts } =
			await import('./tenant-posts');

		const invalidated = await capturedInvalidationKeys((client) =>
			invalidateTenantPosts(client, TENANT_ID),
		);
		expectListCovered('tenant-posts', 'invalidateTenantPosts', invalidated, [
			[
				'posts list page',
				[
					'tenant',
					...TENANT_POSTS_QUERY_KEY,
					TENANT_ID,
					{ q: 'x', cursor: 'c' },
				],
			],
		]);
		// The LINE, required separately: the detail query of the row that was
		// just saved/deleted. Factory shape: ['tenant', …key, tenantId, variables].
		expectLineCovered('tenant-posts', 'invalidateTenantPosts', invalidated, [
			[
				'post detail (the line)',
				[
					'tenant',
					...TENANT_POSTS_QUERY_KEY,
					'detail',
					TENANT_ID,
					{ postId: 'p1' },
				],
			],
		]);
	});
});
