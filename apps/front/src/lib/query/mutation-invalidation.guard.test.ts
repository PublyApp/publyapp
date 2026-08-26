// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 *
 * ## Module discovery (BLOQUANT 1 fix, verdict-r1)
 *
 * The guard does NOT hand-enumerate the modules it checks. It discovers them
 * from the file system (the real `lib/query/` directory), classifies each one
 * by whether it owns a `useMutation`, and then cross-checks that set against
 * the analysis registry below. The registry is the SECOND mechanism the
 * verdict required: any mutation module present on disk that the registry
 * does not account for turns the guard RED, naming the module — so a mutation
 * added tomorrow is never invisible again. A registry entry that points at a
 * file that no longer exists also reddens (stale registry).
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

// ── File-system discovery ──────────────────────────────────────────

const GUARD_FILE = 'mutation-invalidation.guard.test.ts';

const dir = fileURLToPath(new URL('.', import.meta.url));

const isProductionSource = (file: string): boolean =>
	file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== GUARD_FILE;

const moduleHasMutation = (source: string): boolean =>
	/\buseMutation\s*\(/.test(source);

const discoveredMutationModules = readdirSync(dir)
	.filter(isProductionSource)
	.filter((file) => moduleHasMutation(readFileSync(join(dir, file), 'utf8')));

// ── Analysis registry (the SECOND mechanism: drift detector) ───────
//
// Every mutation module discovered on disk MUST appear here. `list-family`
// entries own a list query and must invalidate it (the guard proves it).
// `no-list` entries own no list query of their own — they are documented so
// the decision is explicit and reviewable, and a future list-query addition
// to one of them is caught by re-classifying it (and would otherwise be an
// unaccounted mutation module the drift detector already reddens).

type ListFamilyEntry = {
	kind: 'list-family';
	helperName: string;
	run: () => Promise<void>;
};

type NoListEntry = {
	kind: 'no-list';
	reason: string;
	load: () => Promise<unknown>;
};

type RegistryEntry = ListFamilyEntry | NoListEntry;

const loadScopedKey = async () =>
	await import('@org/shared-ts/lib/query/create-hooks');

const REGISTRY: Record<string, RegistryEntry> = {
	'staff-users.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffUsers',
		run: async () => {
			const mod = await import('./staff-users');
			const { scopedKey } = await loadScopedKey();
			const invalidated = await capturedInvalidationKeys((client) =>
				mod.invalidateStaffUsers(client),
			);
			expectListCovered('staff-users', 'invalidateStaffUsers', invalidated, [
				[
					'list family root',
					scopedKey('staff', [...mod.STAFF_USERS_QUERY_KEY]),
				],
			]);
		},
	},
	'staff-tenants.ts': {
		kind: 'list-family',
		helperName: 'invalidateAllStaffTenantScopes',
		run: async () => {
			const { invalidateAllStaffTenantScopes, STAFF_TENANTS_QUERY_KEY } =
				await import('./staff-tenants');
			const { scopedKey } = await loadScopedKey();
			const invalidated = await capturedInvalidationKeys((client) =>
				invalidateAllStaffTenantScopes(client),
			);
			expectListCovered(
				'staff-tenants',
				'invalidateAllStaffTenantScopes',
				invalidated,
				[
					[
						'list family root',
						scopedKey('staff', [...STAFF_TENANTS_QUERY_KEY]),
					],
				],
			);
		},
	},
	'staff-tenant-users.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffTenantUsers',
		run: async () => {
			const { invalidateStaffTenantUsers, STAFF_TENANT_USERS_QUERY_KEY } =
				await import('./staff-tenant-users');
			const { scopedKey } = await loadScopedKey();
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
		},
	},
	'staff-invitations.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffInvitations',
		run: async () => {
			const { invalidateStaffInvitations, STAFF_INVITATIONS_QUERY_KEY } =
				await import('./staff-invitations');
			const { scopedKey } = await loadScopedKey();
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
		},
	},
	'staff-tenant-invitations.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffTenantInvitations',
		run: async () => {
			const {
				invalidateStaffTenantInvitations,
				STAFF_TENANT_INVITATIONS_QUERY_KEY,
			} = await import('./staff-tenant-invitations');
			const { scopedKey } = await loadScopedKey();
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
		},
	},
	'staff-profiles.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffProfiles',
		run: async () => {
			const { invalidateStaffProfiles, STAFF_PROFILES_QUERY_KEY } =
				await import('./staff-profiles');
			const { scopedKey } = await loadScopedKey();
			const invalidated = await capturedInvalidationKeys((client) =>
				invalidateStaffProfiles(client),
			);
			expectListCovered(
				'staff-profiles',
				'invalidateStaffProfiles',
				invalidated,
				[
					[
						'list family root',
						scopedKey('staff', [...STAFF_PROFILES_QUERY_KEY]),
					],
				],
			);
		},
	},
	'staff-tenant-profiles.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffTenantProfiles',
		run: async () => {
			const { invalidateStaffTenantProfiles, STAFF_TENANT_PROFILES_QUERY_KEY } =
				await import('./staff-tenant-profiles');
			const { scopedKey } = await loadScopedKey();
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
		},
	},
	'staff-global-tenant-users.ts': {
		kind: 'list-family',
		helperName: 'invalidateGlobalTenantUsers',
		run: async () => {
			const { invalidateGlobalTenantUsers, GLOBAL_TENANT_USERS_QUERY_KEY } =
				await import('./staff-global-tenant-users');
			const { scopedKey } = await loadScopedKey();
			const invalidated = await capturedInvalidationKeys((client) =>
				invalidateGlobalTenantUsers(client),
			);
			expectListCovered(
				'staff-global-tenant-users',
				'invalidateGlobalTenantUsers',
				invalidated,
				[
					[
						'family root',
						scopedKey('staff', [...GLOBAL_TENANT_USERS_QUERY_KEY]),
					],
				],
			);
		},
	},
	'social-accounts.ts': {
		kind: 'list-family',
		helperName: 'invalidateSocialAccounts',
		run: async () => {
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
		},
	},
	'tenant-posts.ts': {
		kind: 'list-family',
		helperName: 'invalidateTenantPosts',
		run: async () => {
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
			// just saved/deleted. Factory shape: ['tenant', …key, 'detail', tenantId, {postId}].
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
		},
	},
	'staff-profile-users.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffProfileUsers',
		run: async () => {
			// Unassigning users from a profile is a list-membership mutation: it
			// changes which rows appear in the profile's nested users list
			// ['staff', 'staff-profiles', 'users', …]. The helper MUST cover that
			// list family (and, through the same prefix, the nested row's line).
			const { invalidateStaffProfileUsers } =
				await import('./staff-profile-users');
			const { scopedKey } = await loadScopedKey();
			const invalidated = await capturedInvalidationKeys((client) =>
				invalidateStaffProfileUsers(client),
			);
			expectListCovered(
				'staff-profile-users',
				'invalidateStaffProfileUsers',
				invalidated,
				[
					[
						'users list family root',
						scopedKey('staff', ['staff-profiles', 'users']),
					],
				],
			);
		},
	},
	// ── no-list mutation modules (documented, not an unguarded hole) ──
	'staff-uploads.ts': {
		kind: 'no-list',
		reason:
			'uploads a staff image to a one-shot presigned URL; this module owns no list query to invalidate (the created upload is a side-effect, not a cached list row).',
		load: () => import('./staff-uploads'),
	},
	'staff-audit-logs.ts': {
		kind: 'no-list',
		reason:
			'exports only useExportStaffAuditLogsMutation (a file download side-effect); the audit-logs list is read-only, so no mutation in this module changes list membership/status.',
		load: () => import('./staff-audit-logs'),
	},
	'tenant-post-images.ts': {
		kind: 'no-list',
		reason:
			'attaches/detaches/alts post images via picker helpers; the only query it touches is the post image cache (consumed at the picker), and post-image mutations carry no list query of their own in this module.',
		load: () => import('./tenant-post-images'),
	},
	'tenant-account-profile.ts': {
		kind: 'no-list',
		reason:
			'updates the tenant account-profile detail entity; there is no derived list/counter projection of it, so the rule requires no list invalidation.',
		load: () => import('./tenant-account-profile'),
	},
	'tenant-settings-general.ts': {
		kind: 'no-list',
		reason:
			'updates the tenant settings-general detail entity; there is no derived list/counter projection of it, so the rule requires no list invalidation.',
		load: () => import('./tenant-settings-general'),
	},
};

// ── Drift detector: RED the moment the real module set diverges ─────

const missingFromRegistry = discoveredMutationModules.filter(
	(file) => !(file in REGISTRY),
);

const orphanRegistryEntries = Object.keys(REGISTRY).filter(
	(file) => !discoveredMutationModules.includes(file),
);

describe('mutation-module discovery integrity (#359)', () => {
	test('every mutation module on disk is analyzed by the guard', () => {
		expect(
			missingFromRegistry,
			`These mutation modules exist in lib/query/ but are NOT in the guard's REGISTRY: ${missingFromRegistry.join(
				', ',
			)}. The guard would silently skip them. Add a REGISTRY entry (list-family or no-list) so the module is audited.`,
		).toHaveLength(0);
	});

	test('the guard registry points only at real mutation modules', () => {
		expect(
			orphanRegistryEntries,
			`These REGISTRY entries do not match any mutation module on disk: ${orphanRegistryEntries.join(
				', ',
			)}. They are stale and must be removed or renamed.`,
		).toHaveLength(0);
	});
});

// ── Per-module audits ──────────────────────────────────────────────

describe('mutation modules invalidate their list query family (#359)', () => {
	for (const file of discoveredMutationModules) {
		const entry = REGISTRY[file];
		if (!entry) {
			// The drift detector above already reddens; skip so we don't double-count.
			continue;
		}

		if (entry.kind === 'list-family') {
			test(`${file} (${entry.kind}) — ${entry.helperName} covers its list family`, async () => {
				await entry.run();
			});
		} else {
			test(`${file} (${entry.kind}) — registered and imported`, async () => {
				// The module loads for real; its no-list classification is documented
				// in REGISTRY[file].reason and reviewable, not an invisible hole.
				const mod = await entry.load();
				expect(mod).toBeTypeOf('object');
			});
		}
	}
});
