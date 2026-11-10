import type {
	GetNextPageParamFunction,
	QueryClient,
	QueryFunctionContext,
	QueryKey,
	QueryMeta,
} from '@tanstack/react-query';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

/** A `lib/query/*` factory (`buildStaffQueryOptions` shape): key builder + fetcher.
 *
 * `TVariables = never` is the ERASED form: a concrete factory's parameter is
 * only assignable to `never` under `strictFunctionTypes`, so a spec entry
 * written with concrete variables is assignable to this. The helper re-widens
 * the pair once, at its single boundary (see the assertion below). */
export type RouteQueryOptions<TVariables = never, TData = unknown> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (variables: TVariables) => Promise<TData>;
	/** The freshness the page's own hook declares. Session-stable factories
	 * pass `Infinity`; without it the QueryClient default (`30_000`, router.tsx)
	 * would refetch data the page deliberately never revalidates on every hover
	 * (M2). The helper spreads it **only when defined** — passing `undefined`
	 * would overwrite that default and make every warm hover refetch (C1). */
	staleTime?: number;
};

/** An `useInfiniteQuery` page: the same factory plus the three options its
 * cache entry needs, so the loader warms the first page in the
 * `{ pages, pageParams }` shape the page's hook reads (a plain `queryClient.query`
 * would write one raw page there and corrupt the walk).
 *
 * `pageParam` is `unknown`, not the concrete `string | undefined`: the
 * extracted fetcher narrows it (`typeof pageParam === 'string' ? pageParam :
 * undefined`), and the hook keeps calling it with `string | undefined`, which
 * is allowed. `signal` is passed through so the extracted fetcher keeps the
 * page hook's abort handle. `getNextPageParam`'s parameters are `never` so a
 * concrete `(lastPage: Response[], …)` factory is assignable; the helper
 * re-types it at the one call site (see the assertion). */
export type RouteInfiniteQueryOptions<
	TVariables = never,
	TPageData = unknown,
	TPageParam = unknown,
> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (
		variables: TVariables,
		pageParam: unknown,
		signal?: AbortSignal,
	) => Promise<TPageData>;
	initialPageParam: TPageParam;
	getNextPageParam: (
		lastPage: never,
		allPages: never[],
		lastPageParam: never,
		allPageParams: never[],
	) => TPageParam | undefined | null;
	staleTime?: number;
};

/** One query the page renders: the factory plus the variables it is called
 * with. `variables` is `unknown` here and typed concretely by each route's
 * spec, which returns an unannotated object literal. */
export type RouteQuerySpecEntry = {
	options: RouteQueryOptions | RouteInfiniteQueryOptions;
	variables: unknown;
};

/**
 * Warms every query the destination page renders, without awaiting: navigation
 * never waits for data (spec §4.2.2). A failure — a rejected fetch **or** a
 * synchronously throwing `queryKey` — is logged and swallowed: the page's own
 * `useQuery` at mount is the request that reports its cause through
 * `QueryDisplay` (spec §4.2.7).
 *
 * A query that already has an observer is skipped: the page that renders it
 * owns it, and re-warming it would clobber its options/meta and turn a hover
 * into a possible logout (M3, spec §8).
 *
 * A factory's `staleTime` is passed only when the factory declares one: an
 * explicit `staleTime: undefined` overwrites the QueryClient default in
 * `defaultQueryOptions` (C1), turning every warm hover into a refetch.
 *
 * `meta.routePreload` is advisory only: `handleAuthedQueryError` skips it only
 * while the query has no observer (spec §8). The page's observer mounts on the
 * same `Query` on click, so the click's 401 still logs out.
 */
export const preloadRouteQueries = (
	queryClient: QueryClient,
	spec: Record<string, RouteQuerySpecEntry>,
): void => {
	const meta: QueryMeta = { routePreload: true };
	const logFailure = (error: unknown): void => {
		logger.warn('[route preload] query preload failed', { error });
	};

	for (const entry of Object.values(spec)) {
		try {
			// The spec couples a factory with its own variables at the call site;
			// the entry type erases the pair to `never` (see RouteQueryOptions), so
			// re-widen it once here — the single boundary that erases it. Both
			// directions are related, so this is a legal single assertion: no `any`,
			// no `never`.
			const { options, variables } = entry as {
				options:
					| RouteQueryOptions<unknown>
					| RouteInfiniteQueryOptions<unknown>;
				variables: unknown;
			};
			const queryKey = options.queryKey(variables);

			// A mounted query is already managed by its page (M3): warming it would
			// only clobber `query.options` and could earn a 401 the page's observer
			// turns into a logout. Cold / unobserved only.
			const existing = queryClient
				.getQueryCache()
				.find({ queryKey, exact: true });
			if (existing !== undefined && existing.getObserversCount() > 0) {
				continue;
			}

			// Only when the factory declares it: an explicit `undefined` would
			// overwrite the QueryClient default and make every warm hover refetch
			// (C1). Two explicit call sites rather than a conditional spread.
			const staleTime = options.staleTime;

			if ('initialPageParam' in options) {
				const infiniteOptions = {
					queryKey,
					queryFn: ({
						pageParam,
						signal,
					}: QueryFunctionContext<QueryKey, unknown>) =>
						options.fetcher(variables, pageParam, signal),
					initialPageParam: options.initialPageParam,
					// `GetNextPageParamFunction` is contravariant on the page type;
					// the entry erased it, so re-type it at the one call site.
					getNextPageParam:
						options.getNextPageParam as GetNextPageParamFunction<
							unknown,
							unknown
						>,
					meta,
				};
				void (
					staleTime === undefined
						? queryClient.infiniteQuery(infiniteOptions)
						: queryClient.infiniteQuery({ ...infiniteOptions, staleTime })
				).catch(logFailure);
				continue;
			}

			const queryOptions = {
				queryKey,
				queryFn: () => options.fetcher(variables),
				meta,
			};
			void (
				staleTime === undefined
					? queryClient.query(queryOptions)
					: queryClient.query({ ...queryOptions, staleTime })
			).catch(logFailure);
		} catch (error) {
			logFailure(error);
		}
	}
};
