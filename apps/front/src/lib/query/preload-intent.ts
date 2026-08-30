import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import type {
	RoutePreload,
	RoutePreloadEntry,
} from '~/lib/navigation/route-preload';

/**
 * Executes `staticData.preload` entries on intent-preload navigation events
 * (hover/viewport) by subscribing to `router.onBeforeLoad`. Each entry's
 * `options.queryKey(variables)` is resolved and `ensureQueryData` is called to
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

			// `NavigationEventInfo` carries no `matches` field (verified against
			// `@tanstack/router-core@1.171.26` `NavigationEventInfo` type definition,
			// l.419-426: `{ fromLocation?, toLocation, pathChanged, hrefChanged,
			// hashChanged }`). Resolve the destination matches ourselves.
			// `matchRoutes` returns `AnyRouteMatch[]` whose public type does NOT
			// expose `staticData`; the runtime match object DOES carry the
			// merged per-route `staticData` as a top-level field (verified at
			// runtime on @tanstack/router-core 1.171.x) — the merged T1 read
			// `match.options?.staticData`, which is undefined on matches, so the
			// hook could never see a preload entry. Read `match.staticData`.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const matchedRoutes = router.matchRoutes(event.toLocation) as any[];
			if (!matchedRoutes || matchedRoutes.length === 0) {
				return;
			}

			// Collect preload entries from every matched route (deepest first so
			// the most-specific route's entries run after the less-specific ones).
			for (let index = matchedRoutes.length - 1; index >= 0; index -= 1) {
				const match = matchedRoutes[index];
				const preloadFn =
					match.staticData?.preload ??
					(match.options?.staticData?.preload as RoutePreload | undefined);
				if (!preloadFn) {
					continue;
				}

				const entries: readonly RoutePreloadEntry[] = preloadFn({
					params: match.params as Record<string, string>,
				});

				for (const entry of entries) {
					const variables = entry.variables as Record<string, unknown>;
					const queryKey = entry.options.queryKey(variables);

					// `ensureQueryData` only fetches on a cold cache when a
					// `queryFn` is supplied — the app has NO `defaultQueryFn`
					// (router.tsx:158), so a bare `{ queryKey }` call throws
					// `Missing queryFn` (verified at runtime) and the preload
					// silently did nothing at all. The factory's own `fetcher`
					// IS the queryFn: the single shared factory path, deduped
					// by key (§1.2 and plan §3 — no second fetch path). The
					// factory's `staleTime` (when it sets one) is honored so
					// a fresh cache entry stays untouched (§6).
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
						.ensureQueryData({
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
