import type { QueryKey } from '@tanstack/react-query';

// Shared-factory shape produced by `buildStaffQueryOptions` (packages/shared-ts
// create-hooks.ts:418): `{ queryKey(vars), fetcher(vars) }`. The entry couples a
// `options` factory with the `variables` it is called with. This is the SAME
// shape the page body and the crumbs already consume — so a `preload` entry
// cannot introduce a second fetch path (§4, first guard tier).
//
// The shape that satisfies *both* `no-unknown-returns` and the
// production-side typecheck is a generic type alias whose body is a
// type literal with method-shorthand syntax. The two properties at
// play:
//
// (1) Method-shorthand bivariance (TypeScript 2.4) applies to the
//     type literal body even when the literal is wrapped in a
//     generic alias — verified empirically in
//     `apps/front/src/test-shape9.ts`: a
//     `type Factory<TVariables, TData> = {
//       queryKey(variables: TVariables): QueryKey;
//       fetcher(variables: TVariables): Promise<TData>;
//     }` accepts a production factory
//     `prod = { queryKey: (vars: ConcreteVars) => QueryKey; ... }`
//     at `Factory<unknown, unknown>`. Method-shorthand
//     function-parameter contravariance is relaxed even through a
//     generic alias wrapper.
//
// (2) The `no-unknown-returns` rule
//     (`packages/lint-ts/src/anti-slop/rules/no-unknown-returns.ts`)
//     recurses into the alias body and visits the
//     `TSMethodSignature`. For `fetcher(): Promise<TData>`: the rule
//     unwraps `Promise` to `TData` (a `TSTypeReference` with no
//     `typeArguments`, since `TData` is a free type parameter).
//     `referencedAliasName` returns `'TData'`. The rule then looks
//     up `TData` in its `aliases` map (line 72) — type parameters
//     are not declared aliases, so the lookup returns undefined
//     and the function would return `false`... BUT the rule ALSO
//     passes `lexicalTypeParameterNames(node, visitorKeys)` as
//     `shadowedAliases` (line 94). That helper walks up the parent
//     chain (verified in
//     `packages/lint-ts/src/anti-slop/shared/lexical-type-parameters.ts`)
//     and collects the type parameter names of every enclosing
//     declaration: the inner method signature's parent is the type
//     literal (no typeParameters), whose parent is the
//     `TSTypeAliasDeclaration` whose `typeParameters` are
//     `[TVariables, TData]`. The shadowed set is
//     `{TVariables, TData}`. The check at line 70
//     (`shadowedAliases.has(name)`) returns `true` for `'TData'`
//     and `resolvesToUnknown` short-circuits to `false`.
//
// Earlier drafts failed for opposite reasons:
//
// - A *non-generic* type alias with method shorthand
//   (`type Factory = { fetcher(vars: unknown): Promise<unknown> }`)
//   is bivariant for function parameters but the rule fires on
//   `Promise<unknown>` (resolves to unknown via the Promise
//   unwrap).
// - A *generic* type alias with property-style function values
//   (`type Factory<T> = { fetcher: (vars: T) => Promise<T> }`)
//   satisfies the rule (the alias is generic, the return is a
//   type-parameter `Promise<T>`) but is NOT bivariant — method
//   shorthand syntax is what triggers the TS bivariance, not
//   function-typed properties. The production factories fail the
//   `Factory<unknown, unknown>` assignment.
//
// The combination here is the only shape that satisfies both.
export type RoutePreloadFactory<TVariables = unknown, TData = unknown> = {
	queryKey(variables: TVariables): QueryKey;
	fetcher(variables: TVariables): Promise<TData>;
};

// The `RoutePreload` (function) stores a *list* of `RoutePreloadEntry`s.
// The entry's `options` widens the factory with
// `& { readonly [key: string]: unknown }` so the production factory can
// keep its extra fields (e.g. `onError` from `buildStaffQueryOptions`'s
// `...restOptions` spread) without losing the structural requirement
// for `queryKey`/`fetcher`. The previous `RoutePreloadFactory<any>` did
// the same job via the `any` escape hatch, which the `no-explicit-any`
// rule now forbids; the wildcard is rebuilt with a `readonly` index
// signature (an explicit `unknown` type on every key) so the lint rule
// stays quiet and the production objects (with their extra `onError`/
// etc. fields) still fit. The index signature is `readonly` because
// preload entries are an immutable intent, not a mutable store.
export type RoutePreloadEntry = {
	options: RoutePreloadFactory<unknown, unknown> & {
		readonly [key: string]: unknown;
	};
	variables: Record<string, unknown>;
};

// The generic lives on the FUNCTION: `preload` is `(args) => readonly
// RoutePreloadEntry[]`, NOT `RoutePreloadEntry<never>[]`. Freezing the entry to
// `never` (r1 draft) made `variables: never` and every `variables: { tenantId }`
// literal a type error — the §1 / T2 example would not compile. Here the
// function returns a plain `readonly RoutePreloadEntry[]`; each literal entry's
// `options` is checked against the factory *shape* and its `variables` flows
// through.
type RoutePreload = (args: {
	params: Record<string, string>;
}) => readonly RoutePreloadEntry[];

// declaration merging :
declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		preload?: RoutePreload;
	}
}
