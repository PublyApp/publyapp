import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { triggerSessionInvalidated } from '~/lib/session-invalidation-channel';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { routeTree } from './routeTree.gen';

// A tab refocus triggers TanStack Query's `refetchOnWindowFocus` for every
// mounted query whose data is stale. With the library default (staleTime: 0)
// that means every single mounted query on the page, every time — a request
// stampede on every alt-tab back to the app. 30s keeps focus-triggered
// revalidation for genuinely idle-too-long data while collapsing the common
// case (glance away, glance back) into a no-op.
const DEFAULT_QUERY_STALE_TIME_MS = 30_000;

export const isAuthedSurfacePath = (pathname: string): boolean =>
	pathname.startsWith('/staff') || pathname.startsWith('/tenant');

/**
 * TanStack Query v5 defaults every query to 3 retries with exponential
 * backoff. Left unset, a 401 (or any deterministic 4xx) costs 3 extra
 * unauthenticated requests and ~7s of delay before the central backstop
 * (`handleAuthedQueryError`) even fires, since `QueryCache.onError` only
 * runs once retries are exhausted (shell r2-F2). A 4xx is never going to
 * succeed on retry, so it never gets one; anything else (network blip, a
 * transient 5xx) gets exactly one.
 */
export const shouldRetryQuery = (
	failureCount: number,
	error: unknown,
): boolean => {
	const failure = toApiFailure(error);
	const status =
		failure.kind === 'problem' || failure.kind === 'validation'
			? failure.status
			: undefined;

	if (status !== undefined && status >= 400 && status < 500) {
		return false;
	}

	return failureCount < 1;
};

/**
 * Central 401→logout backstop (shell-F6): the per-route `shouldLogoutForFailure`
 * guards sprinkled across ~50 call sites are easy to forget on a new page
 * (the tenant picker already had), so this catches every authed-surface
 * query/mutation 401 in one place, regardless of whether the page also has
 * its own guard. Scoped to `/staff`/`/tenant` paths only — `buildStaffQueryOptions`
 * is also used by anonymous-context queries on the auth surface (e.g.
 * `accept-invitation.tsx`'s current-user check), where a 401 is expected and
 * must NOT trigger a logout+redirect.
 */
export const handleAuthedQueryError = (error: unknown): void => {
	if (typeof window === 'undefined') {
		return;
	}

	if (!isAuthedSurfacePath(window.location.pathname)) {
		return;
	}

	if (shouldLogoutForFailure(error)) {
		triggerSessionInvalidated();
	}
};

export function getRouter() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: DEFAULT_QUERY_STALE_TIME_MS,
				retry: shouldRetryQuery,
			},
		},
		queryCache: new QueryCache({ onError: handleAuthedQueryError }),
		mutationCache: new MutationCache({ onError: handleAuthedQueryError }),
	});
	const router = createRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: 'intent',
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient,
	});

	return router;
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
