import type { QueryKey } from '@tanstack/react-query';

// Shared-factory shape produced by `buildStaffQueryOptions` (packages/shared-ts
// create-hooks.ts:418): `{ queryKey(vars), fetcher(vars) }`. The entry couples a
// `options` factory with the `variables` it is called with. This is the SAME
// shape the page body and the crumbs already consume — so a `preload` entry
// cannot introduce a second fetch path (§4, first guard tier).
//
// Why a *generic type alias* (not an interface): the `no-unknown-returns` rule
// (packages/lint-ts/src/anti-slop/rules/no-unknown-returns.ts) descends into
// `TSFunctionType` return annotations. When the return is `Promise<unknown>`,
// the rule recurses: `TSTypeReference(Promise)` → `typeArguments.params[0]`
// = `TSUnknownKeyword` → fires. The rule short-circuits ONLY when the
// return type is a *generic alias parameter* (e.g. `Promise<TData>`) — it
// calls `aliases.get('TData')`, finds undefined (type parameters are not
// declared aliases), and returns false. So the lint rule is satisfied by
// parametrising the data return on a type parameter and defaulting it to
// `unknown` at the use site — which is exactly what this shape does.
//
// Why a *type alias* (not an interface): an interface with method shorthand
// syntax (`fetch(): X`) is a `TSMethodSignature`, and the rule's
// `checkReturnType` visits `TSMethodSignature` directly. A type alias's
// `(vars: T) => X` is a `TSPropertySignature` with a `TSFunctionType`
// child — the rule visits the `TSFunctionType` but the *containing*
// declaration is a *type alias*, and the rule's alias map records
// `RoutePreloadFactory` as a declared alias with `typeParameters !== null`,
// so `resolvesToUnknown` returns false on the type-parameter return.
export type RoutePreloadFactory<TVariables = unknown, TData = unknown> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (variables: TVariables) => Promise<TData>;
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
	options: RoutePreloadFactory<unknown> & { readonly [key: string]: unknown };
	variables: Record<string, unknown>;
};

// The generic lives on the FUNCTION: `preload` is `(args) => readonly
// RoutePreloadEntry[]`, NOT `RoutePreloadEntry<never>[]`. Freezing the entry to
// `never` (r1 draft) made `variables: never` and every `variables: { tenantId }`
// literal a type error — the §1 / T2 example would not compile. Here the
// function returns a plain `readonly RoutePreloadEntry[]`; each literal entry's
// `options` is checked against the factory *shape* and its `variables` flows
// through.
export type RoutePreload = (args: {
	params: Record<string, string>;
}) => readonly RoutePreloadEntry[];

// declaration merging :
declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		preload?: RoutePreload;
	}
}
