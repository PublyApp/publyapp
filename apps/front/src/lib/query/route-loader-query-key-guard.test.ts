import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';

import {
	collectLoaderKeySites,
	createParsedSourceFile,
	extractIdentity,
	identityKey,
	scanRoutes,
} from './route-loader-query-key-guard';
import type { ParsedFile } from './route-loader-query-key-guard';

// ---------------------------------------------------------------------------
// Route-loader <-> page query guard (#851 follow-up, #1552 / #1560, #2340)
// ---------------------------------------------------------------------------
// The scanner lives in `route-loader-query-key-guard.ts` (see its header for the
// model). This suite asserts the REAL route modules under `src/routes/` in both
// directions over the import graph, and proves each defect is caught on
// deliberately wrong fixture routes under
// `tests/fixtures/route-loader-guard/` (excluded from the typecheck program).

const fixtureRoutesDir = path.resolve(
	fileURLToPath(new URL('../../..', import.meta.url)),
	'tests/fixtures/route-loader-guard/routes',
);
const FIXTURE_PREFIX = '../tests/fixtures/route-loader-guard/routes/';

// The 14 sites of plan measurement C, as marker files with how many markers
// each carries. A new exemption must be a conscious edit of this table.
const EXPECTED_EXEMPTION_FILES = {
	'components/app-shell/_needs-reconnect-banner.tsx': 2,
	'components/app-shell/app-shell.tsx': 2,
	'components/app-shell/user-menu.tsx': 1,
	'lib/navigation/entity-crumb.tsx': 1,
	'routes/__root.tsx': 1,
	'routes/authed/staff/_staff-list-team.tsx': 2,
	'routes/authed/staff/jobs/dead-letter.tsx': 1,
	'routes/authed/staff/tenant-users/$userId-organizations-drawer.tsx': 1,
	'routes/authed/staff/tenants/$tenantId/roles/$roleId/_assign-members-state-hook.ts': 1,
	'routes/authed/tenant/posts/_scheduled-rendition-editor.tsx': 1,
	'routes/authed/tenant/settings/integrations.tsx': 1,
};

// The route-keyed closed-drawer skips (`CLOSED_DRAWER_FILES`), one per named
// binding: `<route> <file>#<binding>`.
const EXPECTED_CLOSED_DRAWER = [
	'/_authed-layout/staff/tenants/$tenantId/roles/$roleId/members routes/authed/staff/tenants/$tenantId/roles/$roleId/_assign-members-state-hook.ts#useStaffTenantUsersQuery',
	'/_authed-layout/tenant/posts/drafts routes/authed/tenant/posts/_destination-chips.tsx#useTenantPermissions',
	'/_authed-layout/tenant/posts/drafts routes/authed/tenant/posts/_publish-on-block.tsx#useTenantPermissions',
];

const countByFile = (sites: readonly string[]) => {
	const counts = new Map<string, number>();
	for (const site of sites) {
		const file = site.slice(0, site.lastIndexOf(':'));
		counts.set(file, (counts.get(file) ?? 0) + 1);
	}
	return Object.fromEntries(counts);
};

describe('route-loader <-> page query guard', () => {
	// The guard itself: the REAL route modules, both directions, no violation,
	// and the exemption inventory is exactly the plan's list.
	test('every authenticated route warms what its page renders and renders what it warms (route-loader query-key guard)', async () => {
		const { violations, routes, loaderKeys, exemptions, closedDrawer } =
			await scanRoutes();
		expect(
			routes,
			'the guard must have visited authenticated routes — a scan that finds none is a vacuous pass',
		).toBeGreaterThanOrEqual(1);
		expect(
			loaderKeys,
			'the guard must have resolved at least one route loader key — a blind finder must never read as conformant',
		).toBeGreaterThanOrEqual(1);
		expect(violations, 'route loader <-> page violations').toEqual([]);
		expect(exemptions).toHaveLength(14);
		expect(countByFile(exemptions)).toEqual(EXPECTED_EXEMPTION_FILES);
		// The route-keyed closed-drawer skips are a second exemption surface:
		// pinned here too, so adding one is a conscious edit of this list.
		expect(closedDrawer).toEqual(EXPECTED_CLOSED_DRAWER);
	});

	describe('fixtures (red/green proof)', () => {
		const violationsFor = async (file: string): Promise<string[]> => {
			const { violations } = await scanRoutes({ routesDir: fixtureRoutesDir });
			return violations.filter((violation) =>
				violation.startsWith(`${FIXTURE_PREFIX}${file}:`),
			);
		};

		test('good: the page reads what the loader warms', async () => {
			expect(await violationsFor('good.tsx')).toEqual([]);
		});

		test('missing-warm: a page query no loader warms fails', async () => {
			const violations = await violationsFor('missing-warm.tsx');
			expect(violations).toHaveLength(1);
			expect(violations[0]).toContain(
				'the page renders query factory ../tests/fixtures/route-loader-guard/lib/query/fake-staff-users#fakeStaffUsersQueryOptions but the route loader',
			);
			expect(violations[0]).toContain('preload-exempt');
		});

		test('orphan-warm: a loader key the page never reads fails', async () => {
			const violations = await violationsFor('orphan-warm.tsx');
			expect(violations).toHaveLength(1);
			expect(violations[0]).toContain(
				"loader preloads query factory ../tests/fixtures/route-loader-guard/lib/query/fake-staff-users#fakeStaffUsersQueryOptions that the route's page never renders",
			);
		});

		test('exempt-with-reason: a reasoned exemption passes', async () => {
			expect(await violationsFor('exempt-with-reason.tsx')).toEqual([]);
		});

		test('exempt-no-reason: an empty exemption reason fails', async () => {
			const violations = await violationsFor('exempt-no-reason.tsx');
			expect(violations).toHaveLength(1);
			expect(violations[0]).toContain('has no reason');
		});

		test('stale-exempt: an exemption covering no query call fails', async () => {
			const violations = await violationsFor('stale-exempt.tsx');
			expect(violations).toHaveLength(1);
			expect(violations[0]).toContain('stale « preload-exempt »');
		});

		test('unresolvable-key: an unmarked dynamic key fails loud', async () => {
			const violations = await violationsFor('unresolvable-key.tsx');
			expect(violations).toHaveLength(1);
			expect(violations[0]).toContain('cannot be statically resolved');
		});

		test('dead-literal: a literal the spec never returns is not a warmed key', async () => {
			const violations = await violationsFor('dead-literal.tsx');
			expect(violations).toHaveLength(1);
			expect(violations[0]).toContain(
				'the page renders query factory ../tests/fixtures/route-loader-guard/lib/query/fake-staff-users#fakeStaffUsersQueryOptions but the route loader',
			);
		});

		test('conditional-spec: both branches of a returned spec count (union)', async () => {
			expect(await violationsFor('conditional-spec.tsx')).toEqual([]);
		});

		test('opaque-loader-call: an imported helper called in a loader fails loud', async () => {
			const violations = await violationsFor('opaque-loader-call.tsx');
			expect(violations).toHaveLength(1);
			expect(violations[0]).toContain(
				"loader body calls imported 'warmElsewhere'",
			);
		});

		test('child-route: the walk stops at a child route, both routes are green', async () => {
			expect(await violationsFor('child-route.tsx')).toEqual([]);
			expect(await violationsFor('parent-of-child.tsx')).toEqual([]);
		});
	});

	// Mechanism canaries — pure helper behaviour pinned so a refactor of the
	// extractor can never silently stop seeing the shapes it is built for.
	// These are supplementary: the assertion above walks the real tree and is
	// the guard that matters.

	test('extractIdentity recognises a factory receiver as the query identity', () => {
		const { identity, problem } = extractIdentity(
			parseExpression(
				'staffTenantDetailsQueryOptions.queryKey({ tenantId: "t1" })',
			),
			new Map([
				[
					'staffTenantDetailsQueryOptions',
					{
						module: 'lib/query/staff-tenants',
						exportedName: 'staffTenantDetailsQueryOptions',
					},
				],
			]),
			3,
		);
		expect(problem).toBeUndefined();
		expect(identity).toEqual({
			kind: 'factory',
			module: 'lib/query/staff-tenants',
			name: 'staffTenantDetailsQueryOptions',
		});
	});

	test('extractIdentity recognises static array literals and string literals', () => {
		const array = extractIdentity(
			parseExpression("['staff', 'tenants', 'details']"),
			new Map(),
			1,
		);
		expect(array.identity).toEqual({
			kind: 'literal',
			value: JSON.stringify(['staff', 'tenants', 'details']),
		});

		const stringLiteral = extractIdentity(
			parseExpression("'staff-tenants'"),
			new Map(),
			1,
		);
		expect(stringLiteral.identity).toEqual({
			kind: 'literal',
			value: '"staff-tenants"',
		});
	});

	test('extractIdentity fails loud on a dynamic queryKey expression (function call)', () => {
		const extracted = extractIdentity(
			parseExpression('buildQueryKey(params)'),
			new Map(),
			7,
		);
		expect(extracted.identity).toBeUndefined();
		expect(extracted.problem).toContain('cannot be statically resolved');
		expect(extracted.problem).toContain('line 7');
	});

	test('collectLoaderKeySites reads keys from queryClient.query/ensureQueryData/prefetchQuery calls, nested included', () => {
		const sourceFile = createParsedSourceFile(
			'canary-loader.tsx',
			[
				'const loader = async ({ context }) => {',
				'  const fetchDetails = () =>',
				'    context.queryClient.query({',
				"      queryKey: ['staff', 'tenants', 'details'],",
				'      queryFn: () => null,',
				'    });',
				'  await fetchDetails();',
				'  await context.queryClient.ensureQueryData({',
				'    queryKey: detailsQueryOptions.queryKey({ tenantId: "t1" }),',
				'    queryFn: () => null,',
				'  });',
				'};',
			].join('\n'),
			'route-loader query-key guard canary',
		);
		let loaderNode: ts.ArrowFunction | undefined;
		const visit = (node: ts.Node): void => {
			// The OUTER loader arrow, not the inner `queryFn: () => null` arrows:
			// anchor on the `const loader = ...` declaration.
			if (
				loaderNode === undefined &&
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.name.text === 'loader' &&
				node.initializer &&
				ts.isArrowFunction(node.initializer)
			) {
				loaderNode = node.initializer;
			}
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);

		const file: ParsedFile = {
			absolutePath: '/canary/loader.tsx',
			relativePath: 'routes/canary/loader.tsx',
			sourceFile,
			bindings: new Map([
				[
					'detailsQueryOptions',
					{
						module: 'lib/query/staff-tenants',
						exportedName: 'detailsQueryOptions',
					},
				],
			]),
		};

		if (!loaderNode) {
			throw new Error('canary fixture must contain an arrow function');
		}

		const { identities, errors } = collectLoaderKeySites(loaderNode.body, file);
		expect(errors).toEqual([]);
		expect(identities.map(identityKey).sort()).toEqual(
			[
				'literal:["staff","tenants","details"]',
				'factory:lib/query/staff-tenants#detailsQueryOptions',
			].sort(),
		);
	});
});

const parseExpression = (source: string): ts.Expression => {
	const sourceFile = createParsedSourceFile(
		'canary-expression.ts',
		`const expression = ${source};`,
		'route-loader query-key guard canary',
	);
	let expression: ts.Expression | undefined;
	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && node.initializer) {
			expression = node.initializer;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	if (!expression) {
		throw new Error('canary fixture must contain a variable initializer');
	}
	return expression;
};
