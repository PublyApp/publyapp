import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { RoutePreloadEntry } from '~/lib/navigation/route-preload';

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
			// `matchRoutes` returns `AnyRouteMatch[]` whose type doesn't expose
			// `options.staticData` — cast to the richer shape we know the router
			// actually produces (matches have `params`, `pathname`, `staticData`).
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const matchedRoutes = router.matchRoutes(event.toLocation) as any[];
			if (!matchedRoutes || matchedRoutes.length === 0) {
				return;
			}

			// Collect preload entries from every matched route (deepest first so
			// the most-specific route's entries run after the less-specific ones).
			for (let index = matchedRoutes.length - 1; index >= 0; index -= 1) {
				const match = matchedRoutes[index];
				const preloadFn = match.options?.staticData?.preload;
				if (!preloadFn) {
					continue;
				}

				const entries: readonly RoutePreloadEntry[] = preloadFn({
					params: match.params as Record<string, string>,
				});

				for (const entry of entries) {
					const queryKey = entry.options.queryKey(
						entry.variables as Record<string, unknown>,
					);

					// `ensureQueryData` is idempotent per key: a fresh cache entry
					// (staleTime honored by the factory's staleTime option) causes
					// zero network traffic on back-to-back hover/click cycles.
					void queryClient.ensureQueryData({ queryKey }).catch(() => {
						// Intentionally swallowed: preload failures are silent by design.
						// The mount-time query owns any error display.
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
