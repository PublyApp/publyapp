import type { QueryClient, QueryKey } from '@tanstack/react-query';

export type RouteQueryPriority = 'critical' | 'secondary' | 'interaction';

type QueryOptionsLike = {
	queryKey: QueryKey;
	queryFn?: unknown;
	enabled?: unknown;
};

type EnsureQueryDataInput = Parameters<QueryClient['ensureQueryData']>[0];
type PrefetchQueryInput = Parameters<QueryClient['prefetchQuery']>[0];

const shouldPreloadRouteQuery = (options: QueryOptionsLike) => {
	return options.enabled !== false;
};

const prefetchRouteQuery = (
	queryClient: QueryClient,
	options: QueryOptionsLike,
) => {
	// React Query Kit getOptions(...) returns TanStack-compatible query options,
	// but callback-typed options remain bound to the specific query data shape.
	// QueryClient.prefetchQuery accepts the same runtime shape, so keep the
	// mismatch isolated at this cache-warming boundary instead of weakening route
	// component hook types.
	return queryClient.prefetchQuery(options as PrefetchQueryInput);
};

const ensureRouteQueryData = (
	queryClient: QueryClient,
	options: QueryOptionsLike,
) => {
	// Blocking preloads need data/error semantics, so they use ensureQueryData.
	// Keep the same isolated React Query Kit/TanStack type boundary as the
	// non-blocking prefetch path.
	return queryClient.ensureQueryData(options as EnsureQueryDataInput);
};

export type RouteQueryEntry<
	TOptions extends QueryOptionsLike = QueryOptionsLike,
	TPriority extends RouteQueryPriority = RouteQueryPriority,
> = {
	options: TOptions;
	priority: TPriority;
	blocking?: boolean;
};

type BlockingRouteQueryEntry<
	TOptions extends QueryOptionsLike = QueryOptionsLike,
> = RouteQueryEntry<TOptions, 'critical'> & {
	blocking: true;
};

type RouteQueriesFactory<
	TContext,
	TQueries extends Record<string, RouteQueryEntry>,
> = (context: TContext) => TQueries;

const preloadablePriorities = new Set<RouteQueryPriority>([
	'critical',
	'secondary',
]);

export const criticalRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): RouteQueryEntry<TOptions, 'critical'> => ({ options, priority: 'critical' });

export const secondaryRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): RouteQueryEntry<TOptions, 'secondary'> => ({
	options,
	priority: 'secondary',
});

export const interactionRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): RouteQueryEntry<TOptions, 'interaction'> => ({
	options,
	priority: 'interaction',
});

export const blockingRouteQuery = <TOptions extends QueryOptionsLike>(
	options: TOptions,
): BlockingRouteQueryEntry<TOptions> => ({
	options,
	priority: 'critical',
	blocking: true,
});

export function routeQueries<
	TContext,
	TQueries extends Record<string, RouteQueryEntry>,
>(factory: RouteQueriesFactory<TContext, TQueries>) {
	return {
		build: factory,

		preload(queryClient: QueryClient, context: TContext) {
			const queries = factory(context);

			for (const query of Object.values(queries)) {
				if (!preloadablePriorities.has(query.priority)) {
					continue;
				}

				if (!shouldPreloadRouteQuery(query.options)) {
					continue;
				}

				void prefetchRouteQuery(queryClient, query.options).catch(() => {
					// Non-blocking route preloads are best-effort cache warming only.
					// Component hooks keep the normal loading/error contract.
				});
			}
		},

		async preloadBlocking(queryClient: QueryClient, context: TContext) {
			const queries = factory(context);
			const blockingQueries = Object.values(queries).filter(
				(query) => query.blocking && shouldPreloadRouteQuery(query.options),
			);

			await Promise.all(
				blockingQueries.map((query) =>
					ensureRouteQueryData(queryClient, query.options),
				),
			);
		},
	};
}
