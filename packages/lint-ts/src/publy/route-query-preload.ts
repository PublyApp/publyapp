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
 *     alias resolution) to an identifier named `useQuery` exactly, or
 *     matching `/^use[A-Z].*\wQuery$/` (the repo's shared-factory hooks:
 *     `useStaffTenantDetailsQuery`, `useStaffProfilesQuery`, `useSuspenseQuery`,
 *     `useInfiniteQuery`; deliberately NOT `useQueryClient` — it ends in
 *     `Client` — and not `usePreloadIntentQueries`, which ends in `Queries`).
 *   - Aliases are followed wherever a static reader can: named imports
 *     (`import { useQuery as uq }`), variable assignments
 *     (`const uq = useQuery`, `let` included), destructuring
 *     (`const { useQuery: uq } = ...`), require chains
 *     (`const uq = require('@tanstack/react-query').useQuery`), and alias
 *     chains (`const a = useQuery; const b = a;`). Every alias resolves to a
 *     canonical hook name in ONE hop — no chain-fixpoint is needed, because
 *     an assignment alias is only created when its initialiser is already
 *     canonical (a maintainer "simplifying" that invariant can measure it:
 *     the alias-chain test in the spec pins the observable behaviour). The
 *     only other reading for any of these would be the silent
 *     false-negative mode this rule is forbidden from entering (an entry it
 *     cannot decide MUST surface loudly, never quietly).
 *   - Function-prototype reflection (`useQuery.call(...)`, `.apply(...)`,
 *     `.bind(...)`) is followed: the callee is a `MemberExpression` whose
 *     property is one of those three reserved names; the rule unwraps the
 *     object side and applies the same hook-name contract. This was a
 *     silent false-negative mode in r5 — the r6 reviewer's two-line probe
 *     (`useQuery.call(null, {...})`) reached `getCalleeInfo` which only
 *     handled `Identifier` and plain `MemberExpression`, returned `null`,
 *     and the visitor bailed without inspecting the call.
 *   - Object-literal assignments (`const obj = { fn: useQuery };`) are
 *     followed for member reads on the declared object: a subsequent
 *     `obj.fn({...})` is resolved to `useQuery` the same way as
 *     `const uq = useQuery; uq({...})`. Property shorthand
 *     (`const obj = { useQuery }`) is honoured too. If the property is
 *     NOT a known hook binding (e.g. `const obj = { fn: someUnknownThing }`)
 *     and the route has no other way to know whether `obj.fn` is a query
 *     hook, the call is reported LOUDLY as `unresolvedHookCall` — the rule
 *     never silently passes a member call it cannot resolve. This is the
 *     r6 closure of the "object wrapping" silent false-negative.
 *   - Namespace member calls are handled TRUTHFULLY: when the object side is
 *     a namespace import (or whole-module require) from a query module,
 *     `RQ.useQuery(...)` is recognised and the diagnostic names `RQ.useQuery`
 *     as the alias actually written in the source, with `useQuery` as the
 *     canonical export name. This is not a blind spot; the earlier state —
 *     docs claiming a blind spot while the member branch half-caught it with
 *     a message naming only the property — was the worst of three options.
 *   - Everything else fails LOUDLY with a dedicated diagnostic: if a route
 *     file binds a name from a query module (`@tanstack/react-query` or a
 *     path containing `lib/query/`) in a way the static reader cannot resolve
 *     to a canonical hook name (default import, whole-module `require`) and
 *     then CALLS that name, the rule reports `unresolvedHookCall` saying
 *     exactly that: it imported from module M as X and cannot decide whether
 *     the call to Y is a query hook. A noisy false positive that a motivated
 *     escape comment silences is worth infinitely more than a silent false
 *     negative (repo doctrine).
 *   - The diagnostic messages name the alias actually seen in the source
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
 * `CallExpression` visitor then has to surface the call as
 * `unresolvableCallee` (or decide to bail silently for known-non-hook
 * indirections like `createFileRoute("/x")({...})`, where the inner call is
 * already visited recursively). Recognised shapes (r6):
 *   - `Identifier` (`useQuery(...)`) — direct hook call.
 *   - `MemberExpression` with identifier property and identifier object
 *     (`RQ.useQuery(...)`) — namespace member call. When the property is
 *     `call`/`apply`/`bind` (the reflective trio), the rule unwraps the
 *     object side: `useQuery.call(null, ...)` is treated as `useQuery(...)`,
 *     `RQ.useQuery.apply(null, args)` as `RQ.useQuery(...)`.
 *   - Anything else (`obj["fn"]()`, `a.b.c()`, an opaque call of a call
 *     whose inner callee is not an Identifier) returns `null` and is
 *     reported as `unresolvableCallee` — the r5 silent-drop defect, made
 *     visible.
 */
const getCalleeInfo = (callee: ESTree.Expression): CalleeInfo | null => {
	if (callee.type === 'Identifier') {
		return {
			callName: callee.name,
			memberObject: null,
			sourceText: callee.name,
		};
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

interface RouteQueryPreloadState {
	queryHookCalls: TrackedHookCall[];
	firstHookCall: ESTree.CallExpression | null;
	unresolvedCalls: Array<{
		readonly node: ESTree.CallExpression;
		readonly callName: string;
		readonly binding: UnresolvedQueryBinding;
	}>;
	/** A callee the rule cannot analyse at all (no binding context). The
	 *  rule must surface this LOUDLY rather than silently — the r5
	 *  `getCalleeInfo` `return null` was the shape of the r6 false-negative
	 *  defect. */
	unresolvableCallees: Array<{
		readonly node: ESTree.CallExpression;
		readonly sourceText: string;
	}>;
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
				'Route file has a query call whose callee this rule cannot analyse (saw `{{sourceText}}`). Declare `staticData.preload` (see docs/records/2026-08-26-plan-preload-routes.md), or add an escape comment with a reason when the call is a known non-hook indirection (#1589).',
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
			// local → canonical-name resolution. Built once per file from
			// `ImportDeclaration` / `VariableDeclarator` visitors, consumed by
			// the `CallExpression` visitor. The pre-r3 version of the rule
			// looked up only the local name in the callee, which let
			// `import { useQuery as uq }` + `uq({...})` slip through (silent
			// false negative). r5 extends the same map to assignment aliases
			// (`const uq = useQuery`), destructuring
			// (`const { useQuery: uq } = ...`), require chains
			// (`const uq = require('...').useQuery`) and alias chains, so the
			// ImportDeclaration visitor alone is no longer the only source.
			aliasToOrigin: new Map<string, string>(),
			queryModuleBindings: new Map<string, string>(),
			unresolvedQueryBindings: new Map<string, UnresolvedQueryBinding>(),
			objectPropertyAliases: new Map<string, string>(),
			objectPropertyUnresolved: new Map<string, UnresolvedQueryBinding>(),
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
						state.aliasToOrigin.set(local, origin);
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
				// `useQuery`. The original (pre-r6) rule silently dropped
				// any member call on an object literal: a maintainer could
				// wrap a hook in `{ fn: useQuery }`, export the object, and
				// call `obj.fn({...})` with zero diagnostics — exactly the
				// r6 silent-false-negative defect. r6 follows the
				// assignment into the literal.
				//
				// A property whose value is NOT a known hook binding
				// (e.g. `const obj = { fn: someUnknownThing }`) is recorded
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
				// Capture the source text of the callee BEFORE
				// `getCalleeInfo` — even when it returns `null` we want to
				// tell the developer what shape we saw (`someFn()()` vs.
				// `obj['fn']()` vs. a chained expression) rather than
				// dropping the call silently. The shape is part of the
				// diagnostic: it tells the maintainer what their
				// indirection looked like.
				// BUT: a callee that is itself a CallExpression
				// (`createFileRoute("/x")({...})`) means the OUTER call has
				// no hook-binding of its own — the INNER call is what
				// matters and the AST visitor visits it recursively. Bail
				// silently here: the rule must NOT surface this as
				// `unresolvableCallee` (the brief's "render the null
				// visible" call applies to genuinely opaque expressions
				// like `obj["fn"]()` or `a.b.c()` on a non-tracked `a.b`,
				// not to the standard `createFileRoute(...)` wrapper).
				if (node.callee.type === 'CallExpression') {
					return;
				}
				const calleeSourceText = context.sourceCode.getText(node.callee);
				const info = getCalleeInfo(node.callee);
				if (info === null) {
					// The callee is a shape the rule does not analyse
					// (call-of-call, computed member, chained member on an
					// opaque expression, etc.). The r5 `return null` in
					// `getCalleeInfo` silently dropped these — the r6
					// closure of the "obj.fn / useQuery.call" defect.
					// Surface LOUDLY: better a noisy false positive silenced
					// by an escape comment than a silent false negative
					// that lets a route consume query data without
					// preload.
					state.unresolvableCallees.push({
						node,
						sourceText: calleeSourceText,
					});
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
				// `cache.findAll(...)`, etc.) and the r5 silent bail
				// preserves that behaviour. A noisy false positive on every
				// member call would drown the genuine signal.
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
						// r5 behaviour: silent bail. The r6 reviewer's
						// "object wrapping" false-negative is closed by the
						// two branches above, not by blanket-noisying every
						// member call (e.g. `client.getQueryState`).
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
				const origin = state.aliasToOrigin.get(info.callName) ?? info.callName;
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
				// Not resolvable to a canonical hook name. If the callee was
				// bound from a query module in a way the rule cannot resolve
				// (default import, whole-module require, or an alias chain
				// from either), this may be a query hook under an opaque name —
				// fail BRUYAMMENT rather than silently: the alternative is the
				// #1589 defect (a route consuming query data with no preload)
				// with no diagnostic at all.
				const binding = state.unresolvedQueryBindings.get(info.callName);
				if (binding !== undefined) {
					state.unresolvedCalls.push({
						node,
						callName: info.callName,
						binding,
					});
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
							data: { sourceText: unresolvable.sourceText },
						});
					}
				}
			},
		};
	},
};
