import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { displayMutationFeedback } from '~/lib/mutation-toast';
import { triggerSessionInvalidated } from '~/lib/session-invalidation-channel';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import {
	resolveMutationFailureIntent,
	resolveMutationSuccessIntent,
} from '@org/shared-ts/lib/mutation-feedback/policy';
import type {
	MutationFailureFeedback,
	MutationSuccessFeedback,
} from '@org/shared-ts/lib/mutation-feedback/types';

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
 * Backstop source shape shared by `Query`/`Mutation` — both expose a `.meta`
 * getter that mirrors their options' `meta`.
 */
type MutationHandlerMeta = MutationFailureFeedback & {
	successMessage?: string;
	showSuccessToast?: boolean;
	silentSuccess?: boolean;
};

type MutationHandlerSource = {
	meta?: MutationHandlerMeta;
};

type AuthedErrorBackstopSource = Pick<MutationHandlerSource, 'meta'>;

const displayNonSilentMutationIntent = (
	intent: Parameters<typeof displayMutationFeedback>[0],
): void => {
	if (intent.kind === 'silent') {
		return;
	}

	void displayMutationFeedback(intent).catch((error: unknown) => {
		logger.error('[Mutation Toast Handler Error]', { error });
	});
};

/**
 * Central 401→logout backstop (shell-F6): the per-route `shouldLogoutForFailure`
 * guards sprinkled across ~50 call sites are easy to forget on a new page
 * (the tenant picker already had), so this catches every authed-surface
 * query/mutation 401 in one place, regardless of whether the page also has
 * its own guard.
 *
 * Ownership is decided from the `Query`/`Mutation` passed in, not just the
 * pathname at callback time (shell-r6-F2): a query/mutation started on the
 * auth surface (e.g. `accept-invitation.tsx`'s current-user check, opted out
 * via `meta.skipAuthedErrorBackstop`) can still resolve its 401 AFTER a
 * cross-tab login has already navigated this tab to `/staff`/`/tenant` — at
 * that point `window.location.pathname` alone can no longer tell an expected
 * auth-surface 401 apart from a genuine authed-surface one, and clearing a
 * newly established session on that stale response is the exact bug this
 * opt-out closes. The pathname check remains the fallback for every query/
 * mutation that does NOT explicitly opt out.
 */
export const handleAuthedQueryError = (
	error: unknown,
	source?: AuthedErrorBackstopSource,
): void => {
	if (source?.meta?.skipAuthedErrorBackstop) {
		return;
	}

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

export const handleMutationError = (
	error: unknown,
	source: MutationHandlerSource = {},
): void => {
	handleAuthedQueryError(error, source);

	const intent = resolveMutationFailureIntent(
		toApiFailure(error),
		source.meta ?? {},
	);
	displayNonSilentMutationIntent(intent);
};

const hasSuccessMetadata = (
	meta: MutationHandlerMeta | undefined,
): meta is MutationSuccessFeedback =>
	meta?.successMessage !== undefined ||
	meta?.showSuccessToast === true ||
	meta?.silentSuccess === true;

export const handleMutationSuccess = (
	data: unknown,
	source: MutationHandlerSource = {},
): void => {
	if (!hasSuccessMetadata(source.meta)) {
		return;
	}

	const intent = resolveMutationSuccessIntent(data, source.meta);
	displayNonSilentMutationIntent(intent);
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
		mutationCache: new MutationCache({
			onError: (error, _variables, _onMutateResult, mutation) =>
				handleMutationError(error, mutation),
			onSuccess: (data, _variables, _onMutateResult, mutation) =>
				handleMutationSuccess(data, mutation),
		}),
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
