import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { RoutePreloadEntry } from '~/lib/navigation/route-preload';

/**
 * Executes `staticData.preload` entries on intent-preload navigation events
 * (hover/viewport) by subscribing to `router.onBeforeLoad`. Each entry's
 * `options.queryKey(variables)` is resolved and the query is fetched to
 * warm the cache silently.
 *
 * Failures are swallowed — a preload is speculative and the mount-time query
 * owns error display through `QueryDisplay`. A 401 during preload must NOT
 * trigger the central logout backstop (`triggerSessionInvalidated`): the real
 * request at mount will handle it.
 *
 * Mounted once in the authed CSR shell (`AppShell`, `ssr: false`).
 */
export const usePreloadIntentQueries = () => {
	const queryClient = useQueryClient();
	const router = useRouter();

	useEffect(() => {
		let active = true;

		const unsubscribe = router.subscribe('onBeforeLoad', (event) => {
			if (!active) {
				return;
			}

			// `NavigationEventInfo` carries no `matches` field (verified
			// against `@tanstack/router-core@1.171.27` `NavigationEventInfo`
			// type definition, l.419-426: `{ fromLocation?, toLocation,
			// pathChanged, hrefChanged, hashChanged }`). Resolve the
			// destination matches ourselves.
			//
			// The `(next: ParsedLocation)` overload of `matchRoutes` is
			// deprecated (router-core 1.171.x); the live signature takes the
			// raw `pathname` and the parsed `search` separately, returning
			// `MakeRouteMatchUnion[]` whose `staticData` is part of the
			// public type and lives at top level (verified in
			// `Matches.d.ts`: `RouteMatch.staticData: StaticDataRouteOption`).
			// The merged T1 read `match.options?.staticData`, which is
			// undefined on a `RouteMatch` — `staticData` is a sibling of
			// `options`, not a child.
			const matchedRoutes = router.matchRoutes(
				event.toLocation.pathname,
				event.toLocation.search,
			);
			if (!matchedRoutes || matchedRoutes.length === 0) {
				return;
			}

			// Collect preload entries from every matched route (deepest
			// first so the most-specific route's entries run after the
			// less-specific ones).
			for (let index = matchedRoutes.length - 1; index >= 0; index -= 1) {
				const match = matchedRoutes[index];
				const preloadFn = match.staticData.preload;
				if (!preloadFn) {
					continue;
				}

				const entries: readonly RoutePreloadEntry[] = preloadFn({
					params: match.params as Record<string, string>,
				});

				for (const entry of entries) {
					const variables = entry.variables as Record<string, unknown>;
					const queryKey = entry.options.queryKey(variables);

					// `queryClient.ensureQueryData` is deprecated on
					// react-query 5.102 in favor of
					// `queryClient.query({ ...options, staleTime: 'static' })`
					// (verified in `query-core/src/queryClient.ts` l.141-144;
					// `StaleTime = number | 'static'` at `types.ts:108`). The
					// app has NO `defaultQueryFn` (router.tsx), so a bare
					// `{ queryKey }` call throws `Missing queryFn` (verified
					// at runtime) and the preload silently did nothing at all
					// — which is the bug the merged T1 left in place.
					// The factory's own `fetcher` IS the queryFn: the single
					// shared factory path, deduped by key (§1.2 and plan §3 —
					// no second fetch path). The factory's `staleTime` (when
					// it sets one) is honored so a fresh cache entry stays
					// untouched (§6).
					//
					// Preload is speculative: a 401 from a hovered link means
					// "the real request at mount will explain itself", never
					// "log out now" (plan §2). `handleAuthedQueryError` skips
					// queries whose options carry
					// `meta.skipAuthedErrorBackstop`, so the preload fetch is
					// marked; every rejection is still swallowed below.
					const { staleTime } = entry.options as {
						staleTime?: number;
					};
					void queryClient
						.query({
							queryKey,
							queryFn: () => entry.options.fetcher(variables),
							staleTime,
							meta: { skipAuthedErrorBackstop: true },
						})
						.catch(() => {
							// Intentionally swallowed: preload failures are
							// silent by design. The mount-time query owns any
							// error display.
						});
				}
			}
		});

		return () => {
			active = false;
			unsubscribe();
		};
	}, [queryClient, router]);
};
