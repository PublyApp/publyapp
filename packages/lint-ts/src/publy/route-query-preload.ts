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
 * Detection (r7):
 *   - A "query hook call" is a `CallExpression` whose callee resolves (after
 *     alias resolution) to an identifier named `useQuery` exactly, or
 *     matching `/^use[A-Z].*\wQuery$/` (the repo's shared-factory hooks:
 *     `useStaffTenantDetailsQuery`, `useStaffProfilesQuery`, `useSuspenseQuery`,
 *     `useInfiniteQuery`; deliberately NOT `useQueryClient` — it ends in
 *     `Client` — and not `usePreloadIntentQueries`, which ends in `Queries`).
 *   - Aliases are followed wherever a static reader can: named imports
 *     (`import { useQuery as uq }`), variable assignments
 *     (`const uq = useQuery`, `let` included), destructuring
 *     (`const { useQuery: uq } = ...`), array destructuring
 *     (`const [f] = [useQuery]`), require chains
 *     (`const uq = require('@tanstack/react-query').useQuery`), alias chains
 *     (`const a = useQuery; const b = a;`), and function-return indirection
 *     (`const getHook = () => useQuery; getHook()({...})`). Every alias
 *     resolves to a canonical hook name in ONE hop — no chain-fixpoint is
 *     needed, because an assignment alias is only created when its
 *     initialiser is already canonical.
 *   - Function-prototype reflection (`useQuery.call(...)`, `.apply(...)`,
 *     `.bind(...)`) is followed: the callee is a `MemberExpression` whose
 *     property is one of those three reserved names; the rule unwraps the
 *     object side and applies the same hook-name contract.
 *   - Object-literal assignments (`const obj = { fn: useQuery };`) are
 *     followed for member reads on the declared object: a subsequent
 *     `obj.fn({...})` is resolved to `useQuery` the same way as
 *     `const uq = useQuery; uq({...})`. Property shorthand
 *     (`const obj = { useQuery }`) is honoured too.
 *   - Namespace member calls are handled TRUTHFULLY: when the object side is
 *     a namespace import (or whole-module require) from a query module,
 *     `RQ.useQuery(...)` is recognised and the diagnostic names `RQ.useQuery`
 *     as the alias actually written in the source, with `useQuery` as the
 *     canonical export name.
 *   - `unresolvableCallee` is gated on `calleeTracesToQueryModule`: if
 *     `getCalleeInfo` returns `null` (chained member `a.b.c()`,
 *     computed member `obj["fn"]()`, optional chaining, call-of-call), the rule
 *     traces the root identifier. If the root traces back to a query-module
 *     binding (default import, namespace import, whole-module require, a
 *     function-return indirection `const getHook = () => useQuery`, or an
 *     alias chain from any of those), the call MIGHT be a query hook and is
 *     reported `unresolvableCallee`. If the root is a local parameter or
 *     non-query binding (`value?.trim()`, `z.string().min(...)`, `controller.cursor...`),
 *     the call is silently ignored — it has nothing to do with a query hook.
 *     This boundary is deliberate: a noisy false positive on a genuinely
 *     opaque hook indirection (one a motivated escape comment silences) is
 *     worth infinitely more than a silent false negative (the #1247 failure
 *     mode, repo doctrine). The gate ensures only query-module-adjacent
 *     opacity triggers the loud path; innocent non-hook chains stay silent.
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

/**
 * Sources that provide query hooks: react-query itself and the repo's
 * shared-factory modules (`apps/front/src/lib/query/**`, imported as
 * `~/lib/query/...` or a relative path). Bindings taken from these modules
 * that the rule cannot resolve to a canonical hook name must fail loudly.
 */
const isQueryModuleSource = (source: string): boolean =>
	source === '@tanstack/react-query' || source.includes('lib/query/');

/** True when the filename is a test/spec file (excluded from checking). */
const isTestFile = (filename: string): boolean =>
	/(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|jsx|mjs|js)$/.test(filename);

/** `Function.prototype.{call,apply,bind}` — the callee is the object side. */
const REFLECTIVE_METHODS: ReadonlySet<string> = new Set([
	'call',
	'apply',
	'bind',
]);

/**
 * Resolves an alias through `aliasToOrigin` to a fixpoint, following
 * transitive chains like `import { uq as uq2 }` after
 * `import { useQuery as uq }` — the map holds `uq2 -> uq` after the
 * second import, but the canonical hook name `useQuery` is one hop
 * further. Returns `name` itself if no chain is recorded, or if a
 * cycle is detected (defensive — the import visitor never produces
 * cycles, but a future visitor might).
 *
 * #1978 calls out the 1-hop-only behaviour as a silent-zero defect:
 * `uq2({...})` previously fell through to the `?? uq2` default and
 * missed the hook contract, producing zero diagnostics for a real
 * call. The fixpoint walk is bounded by the visited set.
 */
const resolveAliasChain = (
	state: Pick<RouteQueryPreloadState, 'aliasToOrigin'>,
	name: string,
): string => {
	const visited = new Set<string>();
	let current = name;
	while (!visited.has(current)) {
		visited.add(current);
		const next = state.aliasToOrigin.get(current);
		if (next === undefined || next === current) {
			return current;
		}
		current = next;
	}
	return current;
};

/**
 * Records one `ImportSpecifier` (or re-export `ExportSpecifier`) into
 * the rule state. The re-export branch (#1978) feeds this helper from
 * `ExportNamedDeclaration` so the alias / query-module / unresolved
 * bindings are populated exactly as if a direct named import had been
 * written — without the helper, re-exports produced a silent zero
 * because the original rule only visited `ImportDeclaration`.
 *
 * `kind` distinguishes the two callers so the rule can log the
 * diagnostic origin if a future debug aid needs it. It does not
 * affect binding semantics today.
 */
type ImportKind = 'import' | 'reexport';
const recordImportSpec = (
	state: RouteQueryPreloadState,
	module: string,
	specifier: ESTree.ImportSpecifier | ESTree.ExportSpecifier,
	_kind: ImportKind,
): void => {
	// `ImportSpecifier` carries `imported` (the canonical name in the
	// source module) and `local` (the name bound in this file). An
	// `ExportSpecifier` from a `from`-clause carries `local` (the
	// canonical name in the source module) and `exported` (the name
	// re-exposed by this file). The two shapes are isomorphic for
	// binding purposes: both publish a canonical hook name under a
	// local binding. The normalisation below turns the ExportSpecifier
	// into a {origin, local} pair that matches the rest of the rule.
	let origin: string;
	let local: string;
	if (specifier.type === 'ImportSpecifier') {
		if (
			specifier.imported.type !== 'Identifier' ||
			specifier.local.type !== 'Identifier'
		) {
			return;
		}
		origin = specifier.imported.name;
		local = specifier.local.name;
	} else {
		if (
			specifier.local.type !== 'Identifier' ||
			specifier.exported.type !== 'Identifier'
		) {
			return;
		}
		origin = specifier.local.name;
		local = specifier.exported.name;
	}
	const isQueryModule = isQueryModuleSource(module);
	if (local === origin) {
		// Named import where local === origin. Only canonical query-hook
		// names matter: `useQuery`, `useStaffProfilesQuery`, etc.
		// (matched by `isRouteQueryHookName`). Non-hook utilities
		// imported FROM a query module — e.g. `toStaffTenantUserRows`,
		// `staffTenantDetailsQueryOptions` — must NOT enter
		// `queryModuleBindings`, otherwise chained calls like
		// `toStaffTenantUserRows(data).slice(0,5).map(...)` would
		// falsely trace the root identifier back to a query module and
		// fire a spurious `unresolvableCallee`. Such a call is a plain
		// non-hook chain (the `.slice().map()` is just array
		// manipulation) and must stay SILENT.
		//
		// Hook-name imports also enter `aliasToOrigin` so the
		// `CallExpression` Identifier-callee branch resolves
		// `useQuery` → `useQuery` and reports it as a tracked hook
		// call (→ `missingPreload`), not `unresolvableCallee`.
		if (!isRouteQueryHookName(origin)) {
			return;
		}
		if (isQueryModule) {
			state.queryModuleBindings.set(local, module);
		}
		state.aliasToOrigin.set(local, origin);
		return;
	}
	state.aliasToOrigin.set(local, origin);
};

interface CalleeInfo {
	/** The name the rule resolves (identifier name, or member property name). */
	readonly callName: string;
	/** For `obj.prop(...)` callees, the object's identifier name; null for
	 *  plain identifier callees. Used to build the truthful alias text. */
	readonly memberObject: string | null;
	/** Original source-text form of the callee (for `unresolvableCallee` and
	 *  for diagnostic context where the structural form matters more than the
	 *  resolved name). */
	readonly sourceText: string;
}

/**
 * Extracts the resolvable name from a CallExpression's callee. Returns `null`
 * when the callee shape is one the rule does not analyse at all — the
 * `CallExpression` visitor then checks `calleeTracesToQueryModule` to decide
 * whether to surface the call as `unresolvableCallee` (only if the root
 * identifier traces to a query-module binding) or bail silently (innocent
 * non-hook chains). Recognised shapes:
 *   - `Identifier` (`useQuery(...)`) — direct hook call.
 *   - `ChainExpression` (`a?.b(...)`) — unwrap to the inner expression.
 *   - `MemberExpression` with identifier property and identifier object
 *     (`RQ.useQuery(...)`) — namespace member call. When the property is
 *     `call`/`apply`/`bind` (the reflective trio), the rule unwraps the
 *     object side: `useQuery.call(null, ...)` is treated as `useQuery(...)`,
 *     `RQ.useQuery.apply(null, args)` as `RQ.useQuery(...)`.
 *   - Anything else (`obj["fn"]()`, `a.b.c()`, an opaque call of a call)
 *     returns `null` — the caller gates on `calleeTracesToQueryModule`.
 */
const getCalleeInfo = (callee: ESTree.Expression): CalleeInfo | null => {
	if (callee.type === 'Identifier') {
		return {
			callName: callee.name,
			memberObject: null,
			sourceText: callee.name,
		};
	}
	if (callee.type === 'ChainExpression') {
		return getCalleeInfo(callee.expression);
	}
	if (
		callee.type === 'MemberExpression' &&
		!callee.computed &&
		callee.property.type === 'Identifier' &&
		callee.object.type === 'Identifier'
	) {
		const propertyName = callee.property.name;
		const objectName = callee.object.name;
		// Reflective trio (`Function.prototype.{call,apply,bind}`): the
		// callee is the receiver object, not the property. Unwrap so
		// `useQuery.call(null, {...})` and `RQ.useQuery.apply(null, [...])`
		// resolve like their underlying calls.
		if (REFLECTIVE_METHODS.has(propertyName)) {
			return {
				callName: objectName,
				memberObject: null,
				sourceText: `${objectName}.${propertyName}`,
			};
		}
		return {
			callName: propertyName,
			memberObject: objectName,
			sourceText: `${objectName}.${propertyName}`,
		};
	}
	return null;
};

/**
 * Traces a callee expression down to its root identifier, unwrapping chains
 * of member access, optional chaining (ChainExpression), and call-of-call
 * wrappers. Returns the root `Identifier` name, or `null` if no root can be
 * found (e.g. `(0, useQuery)({...})` — the comma operator has no identifier
 * root, `obj["fn"]()` with a computed member has no Identifier root on the
 * object side if the object itself is a CallExpression).
 *
 * Used by `calleeTracesToQueryModule` to decide whether an
 * `unresolvableCallee` call is even worth reporting.
 */
const traceRootIdentifier = (node: ESTree.Expression): string | null => {
	if (node.type === 'Identifier') {
		return node.name;
	}
	if (node.type === 'ChainExpression') {
		return traceRootIdentifier(node.expression);
	}
	if (node.type === 'MemberExpression') {
		// Unwrap to the object side, whether it's a simple identifier
		// (`a.b` → `a`) or a nested chain (`a.b.c` → `a`).
		// Computed members (`a["b"]`) are not unwrapped structurally here —
		// the structural unwrap still reaches the root identifier of the object.
		return traceRootIdentifier(node.object);
	}
	if (node.type === 'CallExpression') {
		// Call-of-call: `getHook()({...})` → callee is `getHook()` → unwrap
		// to `getHook` (the identifier being called).
		return traceRootIdentifier(node.callee);
	}
	// ConditionalExpression, LogicalExpression, etc. — no clean root.
	return null;
};

/**
 * Finds the binding info for a callee whose root identifier traces to a
 * query-module binding. Returns the binding for the actionable
 * `unresolvableCallee` message, or `null` if no binding is found (should not
 * happen when `calleeTracesToQueryModule` returned true, but guards against
 * ordering issues). Checks in order: `unresolvedQueryBindings`,
 * `functionHookBindings`, `queryModuleBindings`.
 */
const findQueryModuleBinding = (
	callee: ESTree.Expression,
	state: RouteQueryPreloadState,
): UnresolvedQueryBinding | null => {
	const root = traceRootIdentifier(callee);
	if (root !== null) {
		const binding = state.unresolvedQueryBindings.get(root);
		if (binding !== undefined) {
			return binding;
		}
		// Function-return indirection: `const getHook = () => useQuery;
		// getHook()({...})` — the binding is tracked in functionHookBindings
		// as `getHook → useQuery`. The canonical hook name IS the origin.
		const fnHook = state.functionHookBindings.get(root);
		if (fnHook !== undefined) {
			return { importName: root, module: `<function returning ${fnHook}>` };
		}
		// Query-module binding with a resolved canonical name (namespace import,
		// alias chain) — report with the module and the local name as importName.
		const module = state.queryModuleBindings.get(root);
		if (module !== undefined) {
			return { importName: root, module };
		}
	}
	// Fallback: should not happen if calleeTracesToQueryModule returned true.
	return null;
};

/**
 * Decides whether an `unresolvableCallee` (a callee `getCalleeInfo` returned
 * `null` for) is even in scope: does the root identifier of the callee chain
 * trace back to a query-module binding? If not, this is an innocent non-hook
 * chain (`value?.trim().toLowerCase()`, `z.string().min(...)`, `controller.cursor.onNextPage`)
 * and the rule stays SILENT. Only if the root IS query-module-bound do we
 * report — the call MIGHT be a query hook under an opaque name.
 *
 * Tracks through `queryModuleBindings` (direct bindings), `unresolvedQueryBindings`
 * (default imports / whole-module requires), `functionHookBindings`
 * (functions returning a hook), and `arrayElementAliases`
 * (array destructuring like `const [f] = [useQuery]`).
 */
const calleeTracesToQueryModule = (
	callee: ESTree.Expression,
	state: RouteQueryPreloadState,
): boolean => {
	const root = traceRootIdentifier(callee);
	if (root === null) {
		return false;
	}
	// Direct query-module binding: default import / namespace import /
	// whole-module require (`dq`, `RQ`, `require(...)`).
	if (state.queryModuleBindings.has(root)) {
		return true;
	}
	// Unresolved query binding propagated through an alias chain
	// (`const uq = dq; uq({...})`).
	if (state.unresolvedQueryBindings.has(root)) {
		return true;
	}
	// Function-return indirection: `const getHook = () => useQuery; getHook()({...})`
	// — `getHook` is tracked as returning a query hook.
	if (state.functionHookBindings.has(root)) {
		return true;
	}
	return false;
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

/** A binding taken from a query module in a way the rule cannot resolve to a
 *  canonical hook name (default import, whole-module require). */
interface UnresolvedQueryBinding {
	/** The name bound by the import/require itself (grep-able in source). */
	readonly importName: string;
	/** The module source the binding came from. */
	readonly module: string;
}

/** An unresolvable callee whose root identifier traces to a query-module
 *  binding — the rule can't resolve the call shape but the binding context
 *  means it MIGHT be a query hook, so it must surface loudly. */
interface UnresolvableQueryCallee {
	readonly node: ESTree.CallExpression;
	readonly sourceText: string;
	readonly rootBinding: UnresolvedQueryBinding;
}

interface RouteQueryPreloadState {
	queryHookCalls: TrackedHookCall[];
	firstHookCall: ESTree.CallExpression | null;
	unresolvedCalls: Array<{
		readonly node: ESTree.CallExpression;
		readonly callName: string;
		readonly binding: UnresolvedQueryBinding;
	}>;
	/** An unresolvable callee whose root identifier traces to a query-module
	 *  binding — only populated when that is the case. Innocent non-hook chains
	 *  like `value?.trim().toLowerCase()` or `z.string().min(...)` are silently
	 *  ignored because their root identifier has no query-module origin. */
	unresolvableCallees: UnresolvableQueryCallee[];
	preloadDeclared: boolean;
	reported: boolean;
	unresolvedReported: boolean;
	unresolvableReported: boolean;
	/** local name → canonical hook/export name. Built from named-import
	 *  aliases, assignment aliases (`const uq = useQuery`), destructuring
	 *  (`const { useQuery: uq } = ...`), require chains
	 *  (`const uq = require('...').useQuery`) and alias chains. */
	aliasToOrigin: Map<string, string>;
	/** Whole-module bindings from query modules (namespace imports, default
	 *  imports, whole-module requires) → the module source. Member calls on
	 *  these resolve truthfully (`RQ.useQuery`). */
	queryModuleBindings: Map<string, string>;
	/** Bindings from a query module that the rule cannot resolve to a
	 *  canonical hook name (default imports, whole-module requires). A call
	 *  to one of these is an undecidable entry → loud `unresolvedHookCall`. */
	unresolvedQueryBindings: Map<string, UnresolvedQueryBinding>;
	/** Property aliases on an object-literal binding
	 *  (`const obj = { fn: useQuery }`). Maps `objName.propertyName` →
	 *  `canonicalName`. Read at member-call sites to resolve `obj.fn(...)`.
	 *  A property whose value is NOT a known hook binding is recorded too —
	 *  its member call becomes an `unresolvedHookCall` rather than silent
	 *  false negative (the r6 closure of the "object wrapping" hole). */
	objectPropertyAliases: Map<string, string>;
	/** Inverse: `objName.propertyName` whose initialiser is NOT a known hook
	 *  binding (default import, whole-module require, or any opaque
	 *  expression). Member calls on these are loud `unresolvedHookCall`s,
	 *  not silent. */
	objectPropertyUnresolved: Map<string, UnresolvedQueryBinding>;
	/** Functions that return a query hook (e.g. `const getHook = () => useQuery`).
	 *  Maps the function name → the canonical hook name. When the function is
	 *  then called (`getHook()({...})`), the rule resolves through this map. */
	functionHookBindings: Map<string, string>;
	/** Array-destructuring aliases: `const [f] = [useQuery]`. Maps the local
	 *  element name → the canonical hook name. Handles both literal arrays
	 *  (`[useQuery]`) and aliases (`[uq]` where `uq` resolves to a hook). */
	arrayElementAliases: Map<string, string>;
	/** Query-module sources re-exported with `export * from '...'`
	 *  (#1978). The rule cannot know which named exports the
	 *  re-exported module contributes, so any subsequent call to a
	 *  canonical hook name (matched by `isRouteQueryHookName`) that is
	 *  not otherwise bound must surface an `unresolvedHookCall` naming
	 *  the source. Without this set, `export *` is a silent zero — the
	 *  defect class #1978 names. */
	exportAllQueryModules: Set<string>;
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
			unresolvedHookCall:
				'Route file imports from query module `{{module}}` as `{{importName}}` and calls `{{callName}}`, which this rule cannot resolve to a known query hook. Declare `staticData.preload` (see docs/records/2026-08-26-plan-preload-routes.md), or add an escape comment with a reason when the query is secondary / interaction-triggered (#1589).',
			unresolvableCallee:
				'Route file has a call (`{{sourceText}}`) whose callee this rule cannot analyse: it resolves through binding `{{rootBinding}}` from query module `{{module}}`, which may be a query hook. Declare `staticData.preload` (see docs/records/2026-08-26-plan-preload-routes.md), or add an escape comment with a reason when the call is a known non-hook indirection (#1589).',
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
			unresolvedCalls: [],
			unresolvableCallees: [],
			preloadDeclared: false,
			reported: false,
			unresolvedReported: false,
			unresolvableReported: false,
			aliasToOrigin: new Map<string, string>(),
			queryModuleBindings: new Map<string, string>(),
			unresolvedQueryBindings: new Map<string, UnresolvedQueryBinding>(),
			objectPropertyAliases: new Map<string, string>(),
			objectPropertyUnresolved: new Map<string, UnresolvedQueryBinding>(),
			functionHookBindings: new Map<string, string>(),
			arrayElementAliases: new Map<string, string>(),
			exportAllQueryModules: new Set<string>(),
		};

		return {
			ImportDeclaration(node: ESTree.ImportDeclaration) {
				if (
					node.source.type !== 'Literal' ||
					typeof node.source.value !== 'string'
				) {
					return;
				}
				const module = node.source.value;
				const isQueryModule = isQueryModuleSource(module);
				for (const specifier of node.specifiers) {
					if (specifier.type === 'ImportSpecifier') {
						recordImportSpec(state, module, specifier, 'import');
						continue;
					}
					// Default / namespace imports: the local name binds the WHOLE
					// module. Only query modules matter — the binding is either
					// resolved truthfully on member access (`dq.useQuery`) or
					// reported as undecidable when called directly (`dq(...)`).
					if (specifier.local.type !== 'Identifier' || !isQueryModule) {
						continue;
					}
					const local = specifier.local.name;
					state.queryModuleBindings.set(local, module);
					if (specifier.type === 'ImportDefaultSpecifier') {
						state.unresolvedQueryBindings.set(local, {
							importName: local,
							module,
						});
					}
				}
			},
			// #1978 note (superseded by #2047): the previous code called
			// `recordImportSpec` for re-exports, which invented false local
			// bindings. Re-exports do not create local bindings — see the
			// ExportNamedDeclaration visitor below.
			ExportNamedDeclaration(_node: ESTree.ExportNamedDeclaration) {
				// `export { useQuery } from '...'` (a re-export with a `from`
				// clause) does NOT create a local binding in the current file.
				// The exported name is only visible to downstream importers. A
				// route file that re-exports a query hook but never imports it
				// locally cannot call it, so the rule must NOT treat the
				// re-exported name as a local binding. Previous code called
				// `recordImportSpec` here, which invented false local bindings
				// from re-exports — a false-positive source for blocker #2047.
				//
				// `export { useQuery }` (no `from` clause) publishes a local
				// binding but does not introduce one — it merely re-exports a
				// name already bound in the file. There is nothing to record.
				return;
			},
			// #1978: `export * from '...'` does not surface the named
			// exports to the rule — the canonical hook name is unknown,
			// so the rule cannot decide. The repo doctrine: input the
			// tool cannot decide must fail LOUDLY, naming the module. A
			// silent zero is the defect class #1978 names. We mark the
			// source as an opaque re-export so any subsequent call site
			// whose root identifier looks like a hook binding (canonical
			// name) but is NOT in `aliasToOrigin` triggers an
			// `unresolvedHookCall` naming the source module.
			ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
				if (
					node.source.type !== 'Literal' ||
					typeof node.source.value !== 'string' ||
					!isQueryModuleSource(node.source.value)
				) {
					return;
				}
				// No local name to bind: the re-export is purely a
				// module-level pass-through. Surface the warning once
				// per file by recording a sentinel that the
				// CallExpression visitor recognises and turns into a
				// loud undecidable diagnostic. The sentinel is the
				// source string under a reserved key so it never
				// collides with a real local name.
				state.exportAllQueryModules.add(node.source.value);
			},
			VariableDeclarator(node: ESTree.VariableDeclarator) {
				// `const { useQuery: uq } = <anything>` — the property name is
				// the canonical name, the local name is the alias. Shorthand
				// (`const { useQuery } = ...`) binds local === origin and is a
				// no-op. Non-hook property names (e.g. `useQueryClient`) are
				// not added — they never satisfy the hook contract.
				if (node.id.type === 'ObjectPattern') {
					for (const prop of node.id.properties) {
						if (
							prop.type !== 'Property' ||
							prop.key.type !== 'Identifier' ||
							prop.value.type !== 'Identifier'
						) {
							continue;
						}
						const origin = prop.key.name;
						const local = prop.value.name;
						if (!isRouteQueryHookName(origin)) {
							continue;
						}
						state.aliasToOrigin.set(local, origin);
					}
					return;
				}
				// `const [f] = [useQuery]` — array destructuring. Each element
				// is tracked as an alias to its canonical hook name.
				if (node.id.type === 'ArrayPattern') {
					const init = node.init;
					if (
						init !== null &&
						init !== undefined &&
						init.type === 'ArrayExpression'
					) {
						for (let i = 0; i < init.elements.length; i++) {
							const el = init.elements[i];
							if (el === null || el.type !== 'Identifier') {
								continue;
							}
							const elementId = node.id.elements[i];
							if (elementId?.type !== 'Identifier') {
								continue;
							}
							const origin = state.aliasToOrigin.get(el.name);
							if (origin !== undefined && isRouteQueryHookName(origin)) {
								state.arrayElementAliases.set(elementId.name, origin);
								continue;
							}
							if (isRouteQueryHookName(el.name)) {
								state.arrayElementAliases.set(elementId.name, el.name);
							}
						}
					}
					return;
				}
				if (node.id.type !== 'Identifier') {
					return;
				}
				const init = node.init;
				if (init === null || init === undefined) {
					return;
				}
				const local = node.id.name;
				// `const uq = <identifier>` — assignment alias. Resolves through
				// the alias map, the hook contract, query-module bindings and
				// unresolved query bindings, so chains like
				// `const a = useQuery; const b = a;` propagate too.
				if (init.type === 'Identifier') {
					// Propagate array-element aliases through assignment chains
					// (`const f = arrEl; f({...})`).
					const arrAlias = state.arrayElementAliases.get(init.name);
					if (arrAlias !== undefined) {
						state.arrayElementAliases.set(local, arrAlias);
					}
					// Propagate function-hook aliases through assignment chains
					// (`const g = getHook; g()({...})`).
					const fnAlias = state.functionHookBindings.get(init.name);
					if (fnAlias !== undefined) {
						state.functionHookBindings.set(local, fnAlias);
					}
					const origin = state.aliasToOrigin.get(init.name);
					if (origin !== undefined) {
						state.aliasToOrigin.set(local, origin);
					} else if (isRouteQueryHookName(init.name)) {
						state.aliasToOrigin.set(local, init.name);
					}
					const module = state.queryModuleBindings.get(init.name);
					if (module !== undefined) {
						state.queryModuleBindings.set(local, module);
					}
					const unresolved = state.unresolvedQueryBindings.get(init.name);
					if (unresolved !== undefined) {
						state.unresolvedQueryBindings.set(local, unresolved);
					}
					return;
				}
				// `const RQ = require('@tanstack/react-query')` — whole-module
				// require, same status as a default import.
				if (
					init.type === 'CallExpression' &&
					init.callee.type === 'Identifier' &&
					init.callee.name === 'require' &&
					init.arguments.length === 1 &&
					init.arguments[0].type === 'Literal' &&
					typeof init.arguments[0].value === 'string' &&
					isQueryModuleSource(init.arguments[0].value)
				) {
					const module = init.arguments[0].value;
					state.queryModuleBindings.set(local, module);
					state.unresolvedQueryBindings.set(local, {
						importName: local,
						module,
					});
					return;
				}
				// `const getHook = () => useQuery` — function that returns a
				// query hook. Track it so `getHook()({...})` resolves through
				// `calleeTracesToQueryModule`. Handles both concise arrow body
				// (`() => useQuery`) and block body with single return statement
				// (`() => { return useQuery; }`).
				if (
					(init.type === 'ArrowFunctionExpression' ||
						init.type === 'FunctionExpression') &&
					init.body !== null &&
					init.body.type === 'Identifier'
				) {
					const bodyName = init.body.name;
					const origin = state.aliasToOrigin.get(bodyName);
					if (origin !== undefined && isRouteQueryHookName(origin)) {
						state.functionHookBindings.set(local, origin);
					}
					if (isRouteQueryHookName(bodyName)) {
						state.functionHookBindings.set(local, bodyName);
					}
					return;
				}
				if (
					(init.type === 'ArrowFunctionExpression' ||
						init.type === 'FunctionExpression') &&
					init.body !== null &&
					init.body.type === 'BlockStatement' &&
					init.body.body.length === 1 &&
					init.body.body[0].type === 'ReturnStatement' &&
					init.body.body[0].argument !== null &&
					init.body.body[0].argument.type === 'Identifier'
				) {
					const retName = init.body.body[0].argument.name;
					const origin = state.aliasToOrigin.get(retName);
					if (origin !== undefined && isRouteQueryHookName(origin)) {
						state.functionHookBindings.set(local, origin);
					}
					if (isRouteQueryHookName(retName)) {
						state.functionHookBindings.set(local, retName);
					}
					return;
				}
				// `const uq = <anything>.useQuery` — require chains
				// (`require('@tanstack/react-query').useQuery`), namespace
				// member reads, plain object reads. The property name is the
				// canonical name, exactly like a destructuring alias.
				if (
					init.type === 'MemberExpression' &&
					!init.computed &&
					init.property.type === 'Identifier' &&
					isRouteQueryHookName(init.property.name)
				) {
					state.aliasToOrigin.set(local, init.property.name);
					return;
				}
				// `const obj = { fn: useQuery }` (or shorthand
				// `{ useQuery }`) — record property aliases on the declared
				// object so subsequent `obj.fn({...})` calls resolve to
				// `useQuery`. If the property is NOT a known hook binding
				// (e.g. `const obj = { fn: someUnknownThing }`) it's recorded
				// as `objectPropertyUnresolved` — its member call becomes
				// an `unresolvedHookCall`, never silent.
				if (init.type === 'ObjectExpression') {
					for (const prop of init.properties) {
						if (prop.type !== 'Property') {
							continue;
						}
						if (prop.key.type !== 'Identifier' || prop.computed) {
							continue;
						}
						const propertyName = prop.key.name;
						const value = prop.value;
						const memberKey = `${local}.${propertyName}`;
						// Shorthand: `const obj = { useQuery }` resolves to
						// `useQuery` via the alias map lookup.
						if (prop.shorthand && value.type === 'Identifier') {
							const origin = state.aliasToOrigin.get(value.name);
							if (origin !== undefined && isRouteQueryHookName(origin)) {
								state.objectPropertyAliases.set(memberKey, origin);
								continue;
							}
							if (isRouteQueryHookName(value.name)) {
								state.objectPropertyAliases.set(memberKey, value.name);
								continue;
							}
							// Shorthand pointing at a default-import or
							// whole-module-require binding: the member call
							// would be unresolved, not silent.
							const module = state.queryModuleBindings.get(value.name);
							if (module !== undefined) {
								state.objectPropertyUnresolved.set(memberKey, {
									importName: value.name,
									module,
								});
							}
							continue;
						}
						// Full property: `const obj = { fn: <expr> }`.
						if (value.type === 'Identifier') {
							const origin = state.aliasToOrigin.get(value.name);
							if (origin !== undefined && isRouteQueryHookName(origin)) {
								state.objectPropertyAliases.set(memberKey, origin);
								continue;
							}
							if (isRouteQueryHookName(value.name)) {
								state.objectPropertyAliases.set(memberKey, value.name);
								continue;
							}
							const module = state.queryModuleBindings.get(value.name);
							if (module !== undefined) {
								state.objectPropertyUnresolved.set(memberKey, {
									importName: value.name,
									module,
								});
							}
							continue;
						}
						// Any opaque value (a function expression, a call,
						// anything that isn't a name we recognise) is
						// recorded as unresolved-from-an-unknown-module —
						// the member call will be a loud
						// `unresolvedHookCall` rather than silent.
						state.objectPropertyUnresolved.set(memberKey, {
							importName: local,
							module: '<opaque expression>',
						});
					}
				}
			},
			CallExpression(node: ESTree.CallExpression) {
				// The canonical TanStack Router wrapper: `createFileRoute("/x")({...})`.
				// The OUTER call's callee is a CallExpression
				// (`createFileRoute("/x")(...)`), which has no hook-binding of its
				// own — the INNER call is what matters and the AST visitor visits it
				// recursively. Bail silently: the rule must NOT surface this as
				// `unresolvableCallee`. We check specifically for `createFileRoute`
				// rather than blanket-bailing on every CallExpression callee, because
				// OTHER curried-call shapes — such as `getHook()({...})` where
				// `const getHook = () => useQuery` — must reach the
				// `calleeTracesToQueryModule` gate below.
				if (
					node.callee.type === 'CallExpression' &&
					node.callee.callee.type === 'Identifier' &&
					node.callee.callee.name === 'createFileRoute'
				) {
					return;
				}
				const calleeSourceText = context.sourceCode.getText(node.callee);
				const info = getCalleeInfo(node.callee);
				if (info === null) {
					// The callee is a shape the rule does not analyse directly
					// (chained member `a.b.c()`, computed member `obj["fn"]()`,
					// optional chaining, etc.). Before deciding whether to
					// surface this LOUDLY, check whether the root identifier of
					// the callee chain traces back to a query-module binding.
					// If it does NOT (e.g. `value?.trim().toLowerCase()`,
					// `z.string().min(...)`, `controller.cursor.onNextPage`),
					// this is an innocent non-hook chain — bail SILENTLY.
					// Only if the root IS query-module-bound do we report
					// (the call MAY be an opaque query-hook indirection that
					// risks a missing preload).
					if (calleeTracesToQueryModule(node.callee, state)) {
						const binding = findQueryModuleBinding(node.callee, state);
						if (binding !== null) {
							state.unresolvableCallees.push({
								node,
								sourceText: calleeSourceText,
								rootBinding: binding,
							});
						}
					}
					return;
				}
				// Member callee (`RQ.useQuery(...)`): the property name IS the
				// canonical name. When the object side is a whole-module
				// binding from a query module, the truthful alias is the full
				// member text written in the source — the earlier state, which
				// named only the property, produced a misleading message for
				// namespace imports.
				//
				// Two r6 nuances sit ON TOP of the namespace branch:
				//   - Object-literal property aliases are checked FIRST, even
				//     when the property is itself a hook name (`const obj = {
				//     useQuery }; obj.useQuery({...})`). The user wrote a member
				//     call; the truthful alias is the member text (`obj.useQuery`),
				//     not just the property (`useQuery`).
				//   - An unresolved property value (`const obj = { fn: dq };`)
				//     becomes a loud `unresolvedHookCall` here, never silent.
				//
				// When none of the r6 alias entries match AND the property
				// name is not a canonical hook name, this is a method on
				// some non-tracked object (`client.getQueryState(...)`,
				// `cache.findAll(...)`, etc.) — silent bail is correct.
				if (info.memberObject !== null) {
					const origin = info.callName;
					const memberKey = `${info.memberObject}.${origin}`;
					const aliased = state.objectPropertyAliases.get(memberKey);
					if (aliased !== undefined) {
						state.queryHookCalls.push({
							alias: memberKey,
							origin: aliased,
							node,
						});
						if (state.firstHookCall === null) {
							state.firstHookCall = node;
						}
						return;
					}
					const unresolvedPropertyBinding =
						state.objectPropertyUnresolved.get(memberKey);
					if (unresolvedPropertyBinding !== undefined) {
						state.unresolvedCalls.push({
							node,
							callName: memberKey,
							binding: unresolvedPropertyBinding,
						});
						return;
					}
					if (!isRouteQueryHookName(origin)) {
						// Non-hook member call on a non-tracked object — silent bail.
						return;
					}
					const module = state.queryModuleBindings.get(info.memberObject);
					const alias =
						module !== undefined ? `${info.memberObject}.${origin}` : origin;
					state.queryHookCalls.push({ alias, origin, node });
					if (state.firstHookCall === null) {
						state.firstHookCall = node;
					}
					return;
				}
				// Identifier callee: resolve through the alias map, then the
				// hook-name contract.
				const origin = resolveAliasChain(state, info.callName);
				if (isRouteQueryHookName(origin)) {
					state.queryHookCalls.push({
						alias: info.callName,
						origin,
						node,
					});
					if (state.firstHookCall === null) {
						state.firstHookCall = node;
					}
					return;
				}
				// #1978: `export * from '...'` re-exports do not
				// surface named exports, so the canonical hook name
				// is unknown. If the file has at least one
				// `export * from` of a query module AND the callee
				// itself matches the hook-name contract, the rule
				// cannot decide which (if any) named export the
				// identifier refers to. Surface an
				// `unresolvedHookCall` naming the re-exported
				// source rather than producing a silent zero. The
				// first matching source wins; the
				// `unresolvedReported` flag prevents a second
				// diagnostic in the same file.
				if (isRouteQueryHookName(info.callName)) {
					const first = state.exportAllQueryModules.values().next();
					if (!first.done) {
						const module = first.value;
						state.unresolvedCalls.push({
							node,
							callName: info.callName,
							binding: { importName: info.callName, module },
						});
						return;
					}
				}
				// Not resolvable to a canonical hook name. If the callee was
				// bound from a query module in a way the rule cannot resolve to
				// a canonical hook name (default import, whole-module require,
				// or an alias chain from either), this may be a query hook
				// under an opaque name — fail LOUDLY rather than silently.
				const binding = state.unresolvedQueryBindings.get(info.callName);
				if (binding !== undefined) {
					state.unresolvedCalls.push({
						node,
						callName: info.callName,
						binding,
					});
				}
				// Also check array-element aliases: `const [f] = [useQuery]; f({...})`
				if (state.arrayElementAliases.has(info.callName)) {
					const arrOrigin = state.arrayElementAliases.get(info.callName)!;
					state.queryHookCalls.push({
						alias: info.callName,
						origin: arrOrigin,
						node,
					});
					if (state.firstHookCall === null) {
						state.firstHookCall = node;
					}
					return;
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
				// A declared preload makes BOTH families silent: the route is
				// not defect-dormant, the query is preloaded.
				if (state.preloadDeclared) {
					return;
				}
				if (!state.reported) {
					const tracked = state.queryHookCalls[0];
					if (tracked !== undefined) {
						state.reported = true;
						// Report once per file on the first hook call, naming the
						// alias actually written in the source AND the canonical
						// hook name the rule matched. Both are required: the
						// alias so the developer can grep, the origin so the
						// diagnosis is honest about WHAT the rule recognised
						// (the latter matters because `uq` alone would not match
						// the hook contract).
						context.report({
							node: tracked.node,
							messageId: 'missingPreload',
							data: { alias: tracked.alias, origin: tracked.origin },
						});
					}
				}
				if (!state.unresolvedReported) {
					const unresolved = state.unresolvedCalls[0];
					if (unresolved !== undefined) {
						state.unresolvedReported = true;
						context.report({
							node: unresolved.node,
							messageId: 'unresolvedHookCall',
							data: {
								callName: unresolved.callName,
								importName: unresolved.binding.importName,
								module: unresolved.binding.module,
							},
						});
					}
				}
				if (!state.unresolvableReported) {
					const unresolvable = state.unresolvableCallees[0];
					if (unresolvable !== undefined) {
						state.unresolvableReported = true;
						context.report({
							node: unresolvable.node,
							messageId: 'unresolvableCallee',
							data: {
								sourceText: unresolvable.sourceText,
								rootBinding: unresolvable.rootBinding.importName,
								module: unresolvable.rootBinding.module,
							},
						});
					}
				}
			},
		};
	},
};
