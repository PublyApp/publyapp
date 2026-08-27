// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient } from '@tanstack/react-query';
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

const REGISTRY: Record<string, RegistryEntry> = {
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

const countListQueryFactories = (source: string): number => {
	if (!LIST_QUERY_FACTORY_RE.test(source)) {
		return 0;
	}
	// A list factory has the shape build*QueryOptions<Client, Response, Vars>:
	// the THIRD generic argument is the *QueryVariables type that declares the
	// pagination fields (cursor/sortId/size/…). A detail factory's third arg is
	// an id-only type, so a list is "owned" iff that type declares pagination.
	const factoryRe =
		/build(Staff|Tenant|StaffSuspense|TenantSuspense)QueryOptions<([\s\S]*?)>\s*\(/g;
	const typeNameRe =
		/(Staff|GlobalTenant|Find|Cursor|Offset)[\w]*QueryVariables\b/;
	const paginationVarRe =
		/\b(cursor|sortId|sortOrder|size|page|limit|q)\s*\??:/;
	const splitTopLevel = (inner: string): string[] => {
		const parts: string[] = [];
		let depth = 0;
		let current = '';
		for (const ch of inner) {
			if (ch === '<' || ch === '(') {
				depth += 1;
				current += ch;
			} else if (ch === '>' || ch === ')') {
				depth = Math.max(0, depth - 1);
				current += ch;
			} else if (ch === ',' && depth === 0) {
				parts.push(current);
				current = '';
			} else {
				current += ch;
			}
		}
		if (current.trim().length > 0) {
			parts.push(current);
		}
		return parts;
	};
	let count = 0;
	let match: RegExpExecArray | null;
	while ((match = factoryRe.exec(source)) !== null) {
		const args = splitTopLevel(match[2] ?? '');
		const variablesRaw = (args[2] ?? '').trim().replace(/<.*$/, '').trim();
		if (!typeNameRe.test(variablesRaw)) {
			continue;
		}
		const typeBlock = source.match(
			new RegExp(
				`export (?:type|interface) ${variablesRaw.replace(
					/[.*+?^${}()|[\]\\]/g,
					'\\$&',
				)}\\s*[=:]\\s*\\{([\\s\\S]*?)\\n\\};?`,
			),
		)?.[1];
		if (typeBlock && paginationVarRe.test(typeBlock)) {
			count += 1;
		}
	}
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
});
