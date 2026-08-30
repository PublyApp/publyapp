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
 *   - A "query hook call" is a `CallExpression` whose callee resolves to an
 *     identifier named `useQuery` exactly, or matching
 *     `/^use[A-Z].*\wQuery$/` (the repo's shared-factory hooks:
 *     `useStaffTenantDetailsQuery`, `useStaffProfilesQuery`, `useSuspenseQuery`,
 *     `useInfiniteQuery`; deliberately NOT `useQueryClient` — it ends in
 *     `Client` — and not `usePreloadIntentQueries`, which ends in `Queries`).
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

interface RouteQueryPreloadState {
	queryHookNames: Set<string>;
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
				'Route file calls query hook `{{hook}}` without declaring `staticData.preload`. Declare `staticData: { preload: ({ params }) => [ { options: <shared factory>, variables: <params> } ] }` (see docs/records/2026-08-26-plan-preload-routes.md), or add an escape comment with a reason when the query is secondary / interaction-triggered (#1589).',
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
			queryHookNames: new Set(),
			firstHookCall: null,
			preloadDeclared: false,
			reported: false,
		};

		return {
			CallExpression(node: ESTree.CallExpression) {
				const calleeName = getCalleeName(node.callee);
				if (calleeName === null || !isRouteQueryHookName(calleeName)) {
					return;
				}
				state.queryHookNames.add(calleeName);
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
				if (state.preloadDeclared || state.queryHookNames.size === 0) {
					return;
				}
				const node = state.firstHookCall;
				if (node === null) {
					return;
				}
				state.reported = true;
				// Report once per file on the first hook call, naming one
				// concrete hook so the developer knows which the rule saw.
				const hook = [...state.queryHookNames][0] ?? 'useQuery';
				context.report({
					node,
					messageId: 'missingPreload',
					data: { hook },
				});
			},
		};
	},
};
