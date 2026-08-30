import type { Context, Visitor } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

import { getSourceRelativePath, normalizeFilename } from './path-scopes.ts';

/**
 * `publy/route-query-preload` — cheap first gate for #487: a route file that
 * calls a TanStack Query hook must declare `staticData.preload` in the same
 * file.
 *
 * Follow-up #1589 (this rule) tracks the part of #487 that the 2026-08-26
 * owner arbitration deviated from: the mandatory contract test
 * (`preload-contract.test.tsx`, plan §4, `docs/records/2026-08-26-plan-preload-routes.md`)
 * walks the REAL generated route tree and fails on any orphan preload key —
 * it guards the CONTENT of a declared preload. This rule guards the OTHER
 * half by construction: a query-consuming route that never declares
 * `staticData.preload` can never even reach the contract test, because there
 * is nothing for the contract test to walk. It is the cheap static signal
 * that fires before the slower vitest guard runs.
 *
 * The sanctioned declaration shape (plan §1, same mechanism as
 * `staticData.crumbs`):
 *
 * ```ts
 * export const Route = createFileRoute('/staff/tenants/$tenantId')({
 *   staticData: {
 *     preload: ({ params }) => [
 *       { options: staffTenantDetailsQueryOptions, variables: { tenantId: params.tenantId } },
 *     ],
 *   },
 * });
 * ```
 *
 * Scope:
 *   - Only files under `apps/front/src/routes/` (relative path prefix
 *     `routes/`). Query-definition modules (`lib/query/**`) call the hooks by
 *     design and are out of scope; the route surface is where a missing
 *     preload declaration is a defect.
 *   - Test/spec files are excluded (route tests mount queries intentionally,
 *     and the repo's paired-red-proof convention even relies on fixtures).
 *
 * Detection:
 *   - A "query hook call" is a `CallExpression` whose callee resolves (after
 *     import-alias resolution) to an identifier named `useQuery` exactly, or
 *     matching `/^use[A-Z].*\wQuery$/` (the repo's shared-factory hooks:
 *     `useStaffTenantDetailsQuery`, `useStaffProfilesQuery`, `useSuspenseQuery`,
 *     `useInfiniteQuery`; deliberately NOT `useQueryClient` — it ends in
 *     `Client` — and not `usePreloadIntentQueries`, which ends in `Queries`).
 *   - Import aliases are followed: `import { useQuery as uq } from ...` plus
 *     `uq({...})` is recognised as a query-hook call, because the only other
 *     reading is the silent false-negative that r3 caught (the rule sees an
 *     unknown identifier and defaults to silence — an entry it cannot decide
 *     MUST surface loudly, never quietly).
 *   - Namespace imports (`import * as Q from ...`) are intentionally not
 *     resolved: an oxlint JS plugin runs without TypeScript's module
 *     resolver, so the only safe reading is `Q.useQuery` etc., which the
 *     `MemberExpression` branch already names. Callers that go through a
 *     namespace import plus a renamable export are outside this rule's
 *     contract; the fix is to import the hook by name.
 *   - The diagnostic message names the alias actually seen in the source
 *     (so the developer can grep for it) and the canonical hook name (so
 *     the diagnosis is honest about WHAT the rule saw).
 *   - "preload declared" means the file contains, anywhere, an object
 *     property named `preload` nested inside an object literal that is the
 *     value of a property named `staticData` (shorthand accepted).
 *
 * Escape comments: oxlint's native disable directives
 * (`// oxlint-disable-next-line publy/route-query-preload -- <reason>`), which
 * the repo's `check-oxlint-disables.ts` guard requires to name the rule and
 * carry a reviewable reason. The legitimate escapes are the #487 secondary /
 * interaction-triggered query classes — route files whose query hooks feed a
 * drawer, tab or preview that must NOT be route-preloaded per the
 * classification policy.
 *
 * Severity: `warn` in `.oxlintrc.json` (`--quiet` keeps it invisible to
 * `pnpm lint` until the staticData.preload mechanism lands and the route
 * migration starts). A PR that flips it to `error` must measure the offender
 * count first and say it (issue #1589).
 */

const ROUTES_RELATIVE_PREFIX = 'routes/';

/**
 * Auth/routing state-machine surfaces where `staticData.preload` is NOT the
 * mechanism (the preload hook mounts in the app shell; the auth surfaces are
 * SSR with server loaders — plan §0, `docs/records/2026-08-26-plan-preload-routes.md`).
 * Mirrors `prefer-query-display`'s allowlist so the two rules' boundaries
 * stay coherent.
 */
export const ALLOWLISTED_ROUTE_PATHS: readonly string[] = [
	'routes/__root.tsx',
	'routes/authed/layout.tsx',
	'routes/accept-invitation.tsx',
];

const isRouteQueryHookName = (name: string): boolean =>
	name === 'useQuery' || /^use[A-Z].*\wQuery$/.test(name);

/** True when the filename is a test/spec file (excluded from checking). */
const isTestFile = (filename: string): boolean =>
	/(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|jsx|mjs|js)$/.test(filename);

/** Extracts the callee name from a CallExpression's callee. */
const getCalleeName = (callee: ESTree.Expression): string | null => {
	if (callee.type === 'Identifier') {
		return callee.name;
	}
	if (
		callee.type === 'MemberExpression' &&
		!callee.computed &&
		callee.property.type === 'Identifier'
	) {
		return callee.property.name;
	}
	return null;
};

/** Is this an object property named `preload` inside a `staticData` object? */
const isPreloadUnderStaticData = (prop: ESTree.Node): boolean => {
	if (prop.type !== 'Property') {
		return false;
	}
	if (prop.key.type !== 'Identifier' || prop.key.name !== 'preload') {
		return false;
	}
	// An oxlint ESTree `Property` node carries no typed `parent` link, so the
	// nesting is resolved structurally: the caller passes the OUTER
	// `staticData` property and this check is applied to its value's
	// properties (see the ObjectExpression visitor in `create`).
	return true;
};

interface TrackedHookCall {
	readonly alias: string;
	readonly origin: string;
	readonly node: ESTree.CallExpression;
}

interface RouteQueryPreloadState {
	queryHookCalls: TrackedHookCall[];
	firstHookCall: ESTree.CallExpression | null;
	preloadDeclared: boolean;
	reported: boolean;
}

export const routeQueryPreload = {
	meta: {
		type: 'suggestion' as const,
		docs: {
			description:
				'Require route files that call TanStack Query hooks to declare staticData.preload (missing preload declaration = a route the preload contract test can never see).',
			recommended: false,
		},
		schema: [],
		messages: {
			missingPreload:
				'Route file calls query hook `{{alias}}` (imported as `{{origin}}`) without declaring `staticData.preload`. Declare `staticData: { preload: ({ params }) => [ { options: <shared factory>, variables: <params> } ] }` (see docs/records/2026-08-26-plan-preload-routes.md), or add an escape comment with a reason when the query is secondary / interaction-triggered (#1589).',
		},
	},
	create(context: Context): Visitor {
		const rawFilename = normalizeFilename(
			typeof context.filename === 'string' ? context.filename : '',
		);
		const relativePath = getSourceRelativePath(rawFilename);

		if (!relativePath.startsWith(ROUTES_RELATIVE_PREFIX)) {
			return {};
		}
		if (ALLOWLISTED_ROUTE_PATHS.includes(relativePath)) {
			return {};
		}
		if (isTestFile(rawFilename)) {
			return {};
		}

		const state: RouteQueryPreloadState = {
			queryHookCalls: [],
			firstHookCall: null,
			preloadDeclared: false,
			reported: false,
		};

		// local → canonical-name resolution for named imports. Built once per
		// file from `ImportDeclaration` visitors, consumed by the
		// `CallExpression` visitor. The pre-fix version of the rule looked up
		// only the local name in the callee, which let `import { useQuery as
		// uq }` + `uq({...})` slip through (r3 finding: silent false negative).
		// Namespace imports (`import * as Q`) are NOT added here — a JS plugin
		// has no module resolver, so the safe reading is `Q.useQuery` etc.
		// accessed as a MemberExpression, which the existing branch already
		// names correctly.
		const aliasToOrigin = new Map<string, string>();

		return {
			ImportDeclaration(node: ESTree.ImportDeclaration) {
				if (
					node.source.type !== 'Literal' ||
					typeof node.source.value !== 'string'
				) {
					return;
				}
				for (const specifier of node.specifiers) {
					if (specifier.type !== 'ImportSpecifier') {
						continue;
					}
					if (
						specifier.imported.type !== 'Identifier' ||
						specifier.local.type !== 'Identifier'
					) {
						continue;
					}
					const origin = specifier.imported.name;
					const local = specifier.local.name;
					if (local === origin) {
						continue;
					}
					aliasToOrigin.set(local, origin);
				}
			},
			CallExpression(node: ESTree.CallExpression) {
				const localName = getCalleeName(node.callee);
				if (localName === null) {
					return;
				}
				const origin = aliasToOrigin.get(localName) ?? localName;
				if (!isRouteQueryHookName(origin)) {
					return;
				}
				state.queryHookCalls.push({ alias: localName, origin, node });
				if (state.firstHookCall === null) {
					state.firstHookCall = node;
				}
			},
			ObjectExpression(node: ESTree.ObjectExpression) {
				// Find `staticData: { preload: ... }` — the sanctioned declaration
				// surface. A `preload` key anywhere else does NOT count.
				for (const outer of node.properties) {
					if (
						outer.type !== 'Property' ||
						outer.key.type !== 'Identifier' ||
						outer.key.name !== 'staticData' ||
						outer.value.type !== 'ObjectExpression'
					) {
						continue;
					}
					for (const inner of outer.value.properties) {
						if (isPreloadUnderStaticData(inner)) {
							state.preloadDeclared = true;
						}
					}
				}
			},
			'Program:exit'() {
				if (state.reported) {
					return;
				}
				if (state.preloadDeclared || state.queryHookCalls.length === 0) {
					return;
				}
				const tracked = state.queryHookCalls[0];
				if (tracked === undefined) {
					return;
				}
				state.reported = true;
				// Report once per file on the first hook call, naming the
				// local alias actually written in the source AND the canonical
				// hook name the rule matched. Both are required: the alias so
				// the developer can grep, the origin so the diagnosis is
				// honest about WHAT the rule recognised (the latter matters
				// because `uq` alone would not match the hook contract).
				context.report({
					node: tracked.node,
					messageId: 'missingPreload',
					data: { alias: tracked.alias, origin: tracked.origin },
				});
			},
		};
	},
};
