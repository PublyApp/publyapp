import type { QueryKey } from '@tanstack/react-query';

// Shared-factory shape produced by `buildStaffQueryOptions` (packages/shared-ts
// create-hooks.ts:418): `{ queryKey(vars), fetcher(vars) }`. The entry couples a
// `options` factory (defaulted to `any` variables so ANY concrete factory fits)
// with the `variables` it is called with. This is the SAME shape the page body
// and the crumbs already consume — so a `preload` entry cannot introduce a
// second fetch path (§4, first guard tier).
export type RoutePreloadFactory<
	TVariables extends Record<string, unknown> = Record<string, unknown>,
> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (variables: TVariables) => Promise<unknown>;
};

export type RoutePreloadEntry = {
	options: RoutePreloadFactory<any>;
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
