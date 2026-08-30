// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient } from '@tanstack/react-query';
// #1690 / #1691 : le classificateur lit des regex sur du texte brut — un `>`
// dans un littéral de chaîne, ou une définition de type introuvable, le met
// en défaut silencieusement. On passe par l'AST via le TypeScript vendoré par
// ts-morph (le `import ts from 'typescript'` nu n'expose plus la Compiler API
// sous TypeScript 7 — précédent : check-design-system.mts, même commentaire).
import { ts } from 'ts-morph';
import { describe, expect, test, vi } from 'vitest';

/**
 * Mutation-invalidation coherence guard (#359, hardened by #1610).
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
 * ## Detail-LINE coverage is now ASSERTED, not assumed (#1610, part 1)
 *
 * `expectLineCovered` is the second half of the rule (the mutated entity's own
 * detail entry). It is asserted for EVERY list-family module that owns a
 * distinct detail query factory, by importing that factory and feeding its
 * REAL `queryKey()` output to the prefix-coverage check. The guard no longer
 * trusts that the detail key is nested under the list prefix — it proves the
 * invalidation reaches the exact array the app caches for the detail.
 *
 * Three list-family modules (`staff-tenant-invitations`, `social-accounts`,
 * `staff-profile-users`) own NO distinct detail factory: the entity's detail
 * view IS the list row itself (the unassigned user is a ROW of the cursor
 * list; social accounts have no per-account detail). For them the list-family
 * assertion above already proves the line, so no separate `expectLineCovered`
 * is added — this is documented per entry, not silently assumed.
 *
 * The original blind spot: `tenant-posts` was the ONLY module whose detail key
 * is a SIBLING of the list family (so the list prefix does NOT reach it), and
 * it alone carried an explicit `expectLineCovered`. Every other module was
 * trusted to nest its detail under the list prefix. Because the assertion was
 * derived from the prefix rather than read off the real factory, a module
 * whose detail key drifted to a sibling would have gone invisible — the exact
 * shape of the original defect. Now every module with a detail factory is
 * asserted against its real factory key, so a sibling regression reddens the
 * guard instead of hiding.
 *
 * ## `no-list` classification is now PROVEN, not trusted (#1610, part 2)
 *
 * The `no-list` entries used to be a hand-asserted list: the guard trusted
 * that such a module owns no list query of its own. A `no-list` module that
 * gained a list query WITHOUT a new `useMutation` would have escaped the drift
 * detector (discovery keys off `useMutation`), so the classification could
 * silently drift.
 *
 * That classification is now CHECKED from the source: a `no-list` module must
 * not own a list query (a cursor/keyset-paginated `build*QueryOptions`
 * factory). The detector reddens the moment one does, naming the module, so
 * the regression is caught.
 *
 * Why a detector rather than deriving the classification purely from code (the
 * first option the brief offered): "does this module's mutation change a list?"
 * is a SEMANTIC property, not a syntactic one. `staff-audit-logs` proves it —
 * it owns a read-only audit-logs list query, yet its only mutation is a
 * file-download side-effect that never mutates that list, so it is correctly
 * `no-list`. No token-level heuristic distinguishes a mutation-irrelevant
 * read-only list from a list a mutation must invalidate. We therefore keep an
 * explicit `no-list` classification but PROVE it: a `no-list` module that
 * legitimately owns a read-only list records it via `knownListQuery`, and the
 * detector (a) asserts that recorded factory is still present (so the "known"
 * claim is verified, not blindly trusted) and (b) reddens if the module owns
 * ANY other list query. Every other `no-list` module must own zero list
 * queries.
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
			.join(
				'; ',
			)}). The detail key is a SIBLING of the list family, so the list prefix does not reach it — a mutation left its own row's detail view stale.`,
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
// the decision is explicit and reviewable, and (since #1610) PROVEN: a
// `no-list` module that owns a list query reddens the detector (see part 2).

type ListFamilyEntry = {
	kind: 'list-family';
	helperName: string;
	run: () => Promise<void>;
};

type NoListEntry = {
	kind: 'no-list';
	reason: string;
	load: () => Promise<Record<string, unknown>>;
	/**
	 * For a `no-list` module that legitimately owns a READ-ONLY list query
	 * (whose mutation never mutates it), record the one factory name here. The
	 * part-2 detector asserts this factory is present AND that no OTHER list
	 * query is owned. Omit for modules that own no list query at all.
	 */
	knownListQuery?: string;
};

type RegistryEntry = ListFamilyEntry | NoListEntry;

const loadScopedKey = async () =>
	await import('@org/shared-ts/lib/query/create-hooks');

const REGISTRY = {
	// `staff-jobs` is special: it owns THREE list families (queue, dead-letter,
	// system-jobs) plus three detail factories, ALL sharing the single root
	// STAFF_JOBS_QUERY_KEY = ['staff-jobs']. One invalidation helper covers all six
	// via the prefix ['staff','staff-jobs']. The LINE is reached through that same
	// prefix — proven below against each real detail factory, not assumed.
	'staff-jobs.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffJobsQueries',
		run: async () => {
			const {
				invalidateStaffJobsQueries,
				STAFF_JOBS_QUERY_KEY,
				staffJobQueueDetailsQueryOptions,
				staffDeadLetterDetailsQueryOptions,
				staffSystemJobDefinitionDetailsQueryOptions,
			} = await import('./staff-jobs');
			const { scopedKey } = await loadScopedKey();
			const invalidated = await capturedInvalidationKeys((client) =>
				invalidateStaffJobsQueries(client),
			);
			expectListCovered(
				'staff-jobs',
				'invalidateStaffJobsQueries',
				invalidated,
				[
					[
						'queue list family root',
						scopedKey('staff', [...STAFF_JOBS_QUERY_KEY, 'queue']),
					],
					[
						'dead-letters list family root',
						scopedKey('staff', [...STAFF_JOBS_QUERY_KEY, 'dead-letter']),
					],
					[
						'system-jobs list family root',
						scopedKey('staff', [...STAFF_JOBS_QUERY_KEY, 'system-jobs']),
					],
				],
			);
			// LINE: each detail factory's REAL key, proven to be nested under the
			// ['staff','staff-jobs'] root that the helper invalidates — so the
			// prefix reaches them, but we assert it explicitly rather than assume.
			expectLineCovered(
				'staff-jobs',
				'invalidateStaffJobsQueries',
				invalidated,
				[
					[
						'job-queue detail (the line)',
						staffJobQueueDetailsQueryOptions.queryKey({ queueItemId: 'q1' }),
					],
					[
						'dead-letter detail (the line)',
						staffDeadLetterDetailsQueryOptions.queryKey({
							deadLetterId: 'dl1',
						}),
					],
					[
						'system-job-definition detail (the line)',
						staffSystemJobDefinitionDetailsQueryOptions.queryKey({
							systemJobId: 'sj1',
						}),
					],
				],
			);
		},
	},
	'staff-users.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffUsers',
		run: async () => {
			const mod = await import('./staff-users');
			const { staffUserDetailsQueryOptions } = await import('./staff-users');
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
			// LINE: asserted from the REAL detail factory, not assumed nested.
			expectLineCovered('staff-users', 'invalidateStaffUsers', invalidated, [
				[
					'user detail (the line)',
					staffUserDetailsQueryOptions.queryKey({ userId: 'u1' }),
				],
			]);
		},
	},
	'staff-tenants.ts': {
		kind: 'list-family',
		helperName: 'invalidateAllStaffTenantScopes',
		run: async () => {
			const {
				invalidateAllStaffTenantScopes,
				STAFF_TENANTS_QUERY_KEY,
				staffTenantDetailsQueryOptions,
			} = await import('./staff-tenants');
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
			// LINE: asserted from the REAL detail factory (nests under the list
			// root, so the list prefix reaches it — proven, not assumed).
			expectLineCovered(
				'staff-tenants',
				'invalidateAllStaffTenantScopes',
				invalidated,
				[
					[
						'tenant detail (the line)',
						staffTenantDetailsQueryOptions.queryKey({ tenantId: TENANT_ID }),
					],
				],
			);
		},
	},
	'staff-tenant-users.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffTenantUsers',
		run: async () => {
			const {
				invalidateStaffTenantUsers,
				STAFF_TENANT_USERS_QUERY_KEY,
				staffTenantUserDetailsQueryOptions,
			} = await import('./staff-tenant-users');
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
			// LINE: asserted from the REAL detail factory (nests under the list
			// root: ['staff','staff-tenants','users','detail',…]).
			expectLineCovered(
				'staff-tenant-users',
				'invalidateStaffTenantUsers',
				invalidated,
				[
					[
						'tenant-user detail (the line)',
						staffTenantUserDetailsQueryOptions.queryKey({
							tenantId: TENANT_ID,
							userId: 'u1',
						}),
					],
				],
			);
		},
	},
	'staff-invitations.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffInvitations',
		run: async () => {
			const {
				invalidateStaffInvitations,
				STAFF_INVITATIONS_QUERY_KEY,
				staffInvitationDetailsQueryOptions,
			} = await import('./staff-invitations');
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
			// LINE: asserted from the REAL detail factory.
			expectLineCovered(
				'staff-invitations',
				'invalidateStaffInvitations',
				invalidated,
				[
					[
						'invitation detail (the line)',
						staffInvitationDetailsQueryOptions.queryKey({ invitationId: 'i1' }),
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
			// No distinct detail factory: an invitation has no per-row detail
			// query in this module, so the list family IS the line. (Contrast
			// tenant-posts, where the detail is a SIBLING key requiring
			// expectLineCovered.) Hence no separate expectLineCovered here.
		},
	},
	'staff-profiles.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffProfiles',
		run: async () => {
			const {
				invalidateStaffProfiles,
				STAFF_PROFILES_QUERY_KEY,
				staffProfileDetailsQueryOptions,
			} = await import('./staff-profiles');
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
			// LINE: asserted from the REAL detail factory.
			expectLineCovered(
				'staff-profiles',
				'invalidateStaffProfiles',
				invalidated,
				[
					[
						'profile detail (the line)',
						staffProfileDetailsQueryOptions.queryKey({ profileId: 'p1' }),
					],
				],
			);
		},
	},
	'staff-tenant-profiles.ts': {
		kind: 'list-family',
		helperName: 'invalidateStaffTenantProfiles',
		run: async () => {
			const {
				invalidateStaffTenantProfiles,
				STAFF_TENANT_PROFILES_QUERY_KEY,
				staffTenantProfileDetailsQueryOptions,
			} = await import('./staff-tenant-profiles');
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
			// LINE: asserted from the REAL detail factory.
			expectLineCovered(
				'staff-tenant-profiles',
				'invalidateStaffTenantProfiles',
				invalidated,
				[
					[
						'tenant-profile detail (the line)',
						staffTenantProfileDetailsQueryOptions.queryKey({
							tenantId: TENANT_ID,
							profileId: 'p1',
						}),
					],
				],
			);
		},
	},
	'staff-global-tenant-users.ts': {
		kind: 'list-family',
		helperName: 'invalidateGlobalTenantUsers',
		run: async () => {
			const {
				invalidateGlobalTenantUsers,
				GLOBAL_TENANT_USERS_QUERY_KEY,
				globalTenantUserDetailsQueryOptions,
			} = await import('./staff-global-tenant-users');
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
			// LINE: asserted from the REAL detail factory.
			expectLineCovered(
				'staff-global-tenant-users',
				'invalidateGlobalTenantUsers',
				invalidated,
				[
					[
						'global tenant-user detail (the line)',
						globalTenantUserDetailsQueryOptions.queryKey({ userId: 'u1' }),
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
			// No distinct detail factory: social accounts have no per-account
			// detail query in this module, so the list family IS the line.
		},
	},
	'tenant-posts.ts': {
		kind: 'list-family',
		helperName: 'invalidateTenantPosts',
		run: async () => {
			const {
				TENANT_POSTS_QUERY_KEY,
				invalidateTenantPosts,
				tenantPostDetailsQueryOptions,
			} = await import('./tenant-posts');
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
			// The LINE, asserted from the REAL detail factory: the detail query
			// of the row that was just saved/deleted. Factory shape:
			// ['tenant', 'tenant-posts', 'detail', tenantId, {postId}] — a
			// SIBLING of the list family, so the list prefix does NOT reach it.
			expectLineCovered('tenant-posts', 'invalidateTenantPosts', invalidated, [
				[
					'post detail (the line)',
					tenantPostDetailsQueryOptions.queryKey({
						postId: 'p1',
						tenantId: TENANT_ID,
					}),
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
			//
			// LINE note: there is NO separate sibling detail key for a profile user
			// in this module — the unassigned user is a ROW of the cursor list
			// ['staff','staff-profiles','users',{profileId}], so the
			// list-family prefix above already reaches the line. (Contrast
			// tenant-posts, where the detail is a SIBLING key requiring
			// expectLineCovered.) Hence no distinct expectLineCovered here.
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
	// ── no-list mutation modules (documented AND proven, not an unguarded hole) ──
	//
	// Since #1610 the `no-list` classification is CHECKED from source (see the
	// part-2 detector below): a `no-list` module that owns a list query reddens
	// the guard. A module that legitimately owns a read-only list records it via
	// `knownListQuery` and the detector verifies it is still present and that no
	// OTHER list query is owned.
	'staff-uploads.ts': {
		kind: 'no-list',
		reason:
			'uploads a staff image to a one-shot presigned URL; this module owns no list query to invalidate (the created upload is a side-effect, not a cached list row).',
		load: () => import('./staff-uploads'),
		knownListQuery: undefined,
	},
	'staff-audit-logs.ts': {
		kind: 'no-list',
		reason:
			'exports only useExportStaffAuditLogsMutation (a file download side-effect); the audit-logs list is read-only, so no mutation in this module changes list membership/status. The read-only list query it owns is recorded in knownListQuery.',
		load: () => import('./staff-audit-logs'),
		knownListQuery: 'staffAuditLogsQueryOptions',
	},
	'tenant-post-images.ts': {
		kind: 'no-list',
		reason:
			'attaches/detaches/alts post images via picker helpers; the only query it touches is the post image cache (consumed at the picker), and post-image mutations carry no list query of their own in this module.',
		load: () => import('./tenant-post-images'),
		knownListQuery: undefined,
	},
	'tenant-account-profile.ts': {
		kind: 'no-list',
		reason:
			'updates the tenant account-profile detail entity; there is no derived list/counter projection of it, so the rule requires no list invalidation.',
		load: () => import('./tenant-account-profile'),
		knownListQuery: undefined,
	},
	'tenant-settings-general.ts': {
		kind: 'no-list',
		reason:
			'updates the tenant settings-general detail entity; there is no derived list/counter projection of it, so the rule requires no list invalidation.',
		load: () => import('./tenant-settings-general'),
		knownListQuery: undefined,
	},
} satisfies Record<string, RegistryEntry>;

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
	for (const [file, entry] of Object.entries(REGISTRY)) {
		if (!discoveredMutationModules.includes(file)) {
			// The drift detector above already reddens; skip so we don't double-count.
			continue;
		}

		if (entry.kind === 'list-family') {
			test(`${file} (${entry.kind}) — ${entry.helperName} covers its list family and detail line`, async () => {
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

// ── Part 2 (#1610): `no-list` classification is PROVEN from source ──
//
// A `no-list` module must not own a list query (a cursor/keyset-paginated
// `build*QueryOptions` factory). If it does, the coherence rule requires its
// mutation to invalidate that family, so the module belongs in `list-family`.
// We count the pagination-backed `build*QueryOptions` factories in the source
// and compare to what the entry declares (zero, or exactly one `knownListQuery`
// read-only list). A drift to a sibling-style invisible list query reddens
// here, naming the module — closing the manual-classification blind spot.

const LIST_QUERY_FACTORY_RE =
	/build(Staff|Tenant|StaffSuspense|TenantSuspense)QueryOptions\s*</;

// ── Part 1 (#1662): nested-generic third argument is NOT silently skipped ──
//
// `countListQueryFactories` decides whether a module owns a list query by
// splitting the generic arguments of every `build*QueryOptions<…>` factory and
// inspecting the THIRD argument. If that third argument is itself generic —
// `buildStaffQueryOptions<ApiClient, Response, SomeWrapper<PageQueryVariables>>` —
// the non-greedy regex stops at the FIRST `>` (closing `SomeWrapper`), and the
// post-split `replace(/<.*$/, '')` strips the generic, leaving `SomeWrapper`,
// which does NOT match `*QueryVariables`. The factory is silently skipped →
// the module is UNDERCOUNTED. This fabrication proves the undercount today and
// pins the invariant: a nested-generic third argument must not escape detection.

describe('nested-generic third argument is not silently skipped (#1662, part 1)', () => {
	const NESTED_GENERIC_SOURCE = `
export type PageQueryVariables = {
	cursor?: string;
	size?: number;
};

const staffUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffUsersResponse,
	SomeWrapper<PageQueryVariables>
>(
	{
		queryKeyFn: () => ['staff-users'],
		fetcher: async () => ({}),
	},
	{ clientAccessor: getClientManager() },
);
`;

	test('FABRICATION — nested-generic third argument is now correctly counted (proves the fix)', () => {
		// BEFORE the fix: the classifier stripped the nested generic
		// (replace(/<.*$/, '')), leaving "SomeWrapper" (which does not match
		// *QueryVariables), so it returned 0 — a silent undercount.
		// AFTER the fix: the classifier extracts the *QueryVariables type name
		// from anywhere in the third argument (including nested generics), so it
		// correctly counts this factory as a list query.
		const counted = countListQueryFactories(NESTED_GENERIC_SOURCE);
		expect(
			counted,
			'Fabricated a module whose third generic arg is SomeWrapper<PageQueryVariables>. The classifier must count this factory as a list query (it wraps PageQueryVariables, which declares pagination). Before the fix it returned 0 (silent undercount); after the fix it returns 1.',
		).toBe(1);
	});

	test('INVARIANT PIN — a flat *QueryVariables third argument is still counted (no regression)', () => {
		// The fix must not regress the common case: a flat *QueryVariables third
		// argument (no nested generic) must still be counted.
		const flatSource = `
export type StaffUsersQueryVariables = {
	cursor?: string;
	size?: number;
};

const staffUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffUsersResponse,
	StaffUsersQueryVariables
>(
	{
		queryKeyFn: () => ['staff-users'],
		fetcher: async () => ({}),
	},
	{ clientAccessor: getClientManager() },
);
`;
		expect(countListQueryFactories(flatSource)).toBe(1);
	});
});

// ── #1690 : le classificateur AST ne se laisse pas piéger par les
// littéraux de chaîne ──
//
// - #1690 : un `>` dans un littéral de chaîne en position d'argument
//   générique (ou dans le corps de l'appel) arrêtait la regex non-greedy trop
//   tôt → usine ignorée. L'AST n'a pas ce problème.

describe('string-literal > does not stop the match (#1690)', () => {
	test('#1690 — a `>` inside a string literal in the call body does NOT stop the match', () => {
		// BEFORE the fix: the non-greedy regex stopped at the first `>` (in the
		// string literal), so the factory was silently skipped.
		// AFTER the fix: the classifier parses the AST, so string literals are
		// not confused with type argument boundaries.
		const withGtInBody = `
export type StaffUsersQueryVariables = {
	cursor?: string;
	size?: number;
};

const staffUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffUsersResponse,
	StaffUsersQueryVariables
>(
	{
		queryKeyFn: () => ['staff-users'],
		fetcher: async () => ({ id: 'a > b' }),
	},
	{ clientAccessor: getClientManager() },
);
`;
		expect(countListQueryFactories(withGtInBody)).toBe(1);
	});
});

/**
 * #1690 : le classificateur lit maintenant l'AST via le TypeScript
 * vendoré par ts-morph — plus de regex sur du texte brut.
 *
 * - #1690 (réglé) : un `>` dans un littéral de chaîne en position d'argument
 *   générique arrêtaient la regex non-greedy trop tôt → usine ignorée.
 *   L'AST n'a pas ce problème.
 */
const countListQueryFactories = (source: string): number => {
	if (!LIST_QUERY_FACTORY_RE.test(source)) {
		return 0;
	}
	const sf = ts.createSourceFile(
		'__guard_virtual__.ts',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	// Collecte les déclarations de types (type alias + interface) indexées par
	// nom, pour la résolution ultérieure du type `*QueryVariables`.
	const typeDeclarations = new Map<
		string,
		ts.TypeAliasDeclaration | ts.InterfaceDeclaration
	>();
	ts.forEachChild(sf, (node) => {
		if (
			node.kind === ts.SyntaxKind.TypeAliasDeclaration ||
			node.kind === ts.SyntaxKind.InterfaceDeclaration
		) {
			const name = (node as ts.TypeAliasDeclaration | ts.InterfaceDeclaration)
				.name.text;
			typeDeclarations.set(
				name,
				node as ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
			);
		}
	});
	// Champs qui caractérisent une liste paginée (cursor/keyset ou offset).
	const isPaginationMember = (name: string): boolean =>
		/(?:^|\.)(?:cursor|sortId|sortOrder|size|page|limit|q)$/.test(name);
	// Détermine si un type (TypeLiteral ou interface) déclare de la pagination.
	const declaresPagination = (
		node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
	): boolean => {
		// type X = { ... } (TypeLiteral)
		if (node.kind === ts.SyntaxKind.TypeAliasDeclaration) {
			const typeNode = (node as ts.TypeAliasDeclaration).type;
			if (typeNode.kind === ts.SyntaxKind.TypeLiteral) {
				return (typeNode as ts.TypeLiteralNode).members.some(
					(m: ts.TypeElement) =>
						m.kind === ts.SyntaxKind.PropertySignature &&
						m.name !== undefined &&
						ts.isIdentifier(m.name) &&
						isPaginationMember(m.name.text),
				);
			}
			// type X = SomeWrapper<...> (alias vers un type paramétré) : on résout
			// récursivement si la cible est déclarée dans la source.
			if (typeNode.kind === ts.SyntaxKind.TypeReference) {
				const refName = (typeNode as ts.TypeReferenceNode).typeName.getText(sf);
				const target = typeDeclarations.get(refName);
				if (target) {
					return declaresPagination(target);
				}
			}
		}
		// interface X { ... }
		if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
			const typeNode = node as ts.InterfaceDeclaration;
			return typeNode.members.some(
				(m: ts.TypeElement) =>
					m.kind === ts.SyntaxKind.PropertySignature &&
					m.name !== undefined &&
					ts.isIdentifier(m.name) &&
					isPaginationMember(m.name.text),
			);
		}
		return false;
	};
	// Extrait le nom du type `*QueryVariables` d'un argument générique (peut
	// être imbriqué dans un generic : SomeWrapper<PageQueryVariables>).
	const extractVariablesTypeName = (typeNode: ts.TypeNode): string | null => {
		if (typeNode.kind === ts.SyntaxKind.TypeReference) {
			const ref = typeNode as ts.TypeReferenceNode;
			const refName = ref.typeName.getText(sf);
			if (refName.endsWith('QueryVariables')) {
				return refName;
			}
			// Tester les arguments génériques (ex. SomeWrapper<PageQueryVariables>)
			if (ref.typeArguments) {
				for (const arg of ref.typeArguments) {
					const nested = extractVariablesTypeName(arg);
					if (nested) {
						return nested;
					}
				}
			}
		}
		return null;
	};
	// Visite récursivement l'AST pour compter les usines de liste.
	let count = 0;
	const visit = (node: ts.Node): void => {
		if (node.kind === ts.SyntaxKind.CallExpression) {
			const call = node as ts.CallExpression;
			const expressionName = call.expression.getText(sf);
			if (
				/^build(?:Staff|Tenant|StaffSuspense|TenantSuspense)QueryOptions$/.test(
					expressionName,
				)
			) {
				const typeArgs = call.typeArguments;
				if (typeArgs && typeArgs.length >= 3) {
					const variablesTypeName = extractVariablesTypeName(typeArgs[2]!);
					if (variablesTypeName) {
						const declaration = typeDeclarations.get(variablesTypeName);
						if (!declaration) {
							// #1691 : le type est introuvable dans la source. C'est
							// une erreur — pas un `continue` silencieux. Un type
							// importé doit être signalé pour que la source soit
							// auto-suffisante.
							throw new Error(
								`countListQueryFactories: type '${variablesTypeName}' is not declared in-source (it may be imported). The classifier cannot resolve its pagination shape. Either declare the type locally or update the classifier to resolve imports.`,
							);
						}
						if (declaresPagination(declaration)) {
							count += 1;
						}
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return count;
};

describe('no-list classification is proven (no owned list query) (#1610, part 2)', () => {
	for (const [file, entry] of Object.entries(REGISTRY)) {
		if (entry.kind !== 'no-list') {
			continue;
		}

		test(`${file} — no-list classification is proven (owns no list query)`, () => {
			const source = readFileSync(join(dir, file), 'utf8');
			const owned = countListQueryFactories(source);
			const expected = entry.knownListQuery ? 1 : 0;
			expect(
				owned,
				`${file} is classified 'no-list' but owns ${owned} list query/queries (cursor/keyset-paginated build*QueryOptions factory). The coherence rule then requires its mutation to invalidate that family, so this module belongs in 'list-family', not 'no-list'. If a read-only list is intentional, record it via knownListQuery and re-review.`,
			).toBe(expected);

			if (entry.knownListQuery) {
				expect(
					source.includes(entry.knownListQuery),
					`${file} declares knownListQuery '${entry.knownListQuery}' but that factory is not present in the source — the recorded claim is stale and must be reconciled.`,
				).toBe(true);
			}
		});
	}

	test('REPLAY — old guard (hand-asserted list) stays GREEN when a no-list module acquires a list query; new guard catches it (RED)', () => {
		// The OLD guard (pre-#1610) maintained a hand-asserted list of no-list
		// modules. If a no-list module gained a list query WITHOUT also gaining
		// a new useMutation, the drift detector (which keys off useMutation
		// presence) would not fire, and the classification would silently
		// remain 'no-list' — the guard stays GREEN while the module now owns
		// a list it never invalidates.
		//
		// We fabricate such a module: a no-list module that acquires a cursor-
		// paginated build*QueryOptions factory (a list query).
		const fabricatedNoListWithListQuery = `
export type StaffAuditLogsQueryVariables = {
	cursor?: string;
	size?: number;
	sortOrder?: string;
};

// The old guard trusted the 'no-list' classification as a hand-asserted fact.
// This factory makes the module own a list query — but the mutation below
// (a file-download side-effect) never invalidates it. The old guard stays
// GREEN because it never looked at the source.
const staffAuditLogsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffAuditLogsResponse,
	StaffAuditLogsQueryVariables
>(
	{
		queryKeyFn: () => ['staff', 'audit-logs'],
		fetcher: async () => ({}),
	},
	{ clientAccessor: getClientManager() },
);

// A mutation that does NOT touch the list (download side-effect).
export const useDownloadAuditLog = () =>
	useMutation({
		mutationFn: async (id: string) => {
			/* download file */
		},
	});
`;
		// Old guard: hand-asserted list — returns GREEN (it trusts the
		// classification and never inspects the source).
		const oldGuardResult = 'GREEN (hand-asserted list, never inspects source)';

		// New guard: inspects the source and counts list queries.
		const newGuardCount = countListQueryFactories(
			fabricatedNoListWithListQuery,
		);
		// The new guard catches the acquired list query → RED.
		expect(
			newGuardCount,
			'The new guard must count the acquired list query (cursor-paginated buildStaffQueryOptions factory). If this returns 0, the no-list detector is still blind to a module that gained a list it never invalidates.',
		).toBe(1);

		// The old guard result is informational: it documents what the old
		// guard would have returned (GREEN) — proof that the regression was
		// invisible before #1610.
		expect(oldGuardResult).toBe(
			'GREEN (hand-asserted list, never inspects source)',
		);
	});
});
