/**
 * @vitest-environment jsdom
 */
import {
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from '@tanstack/react-query';
import {
	Outlet,
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RoutePreloadFactory } from '~/lib/navigation/route-preload';

import { usePreloadIntentQueries } from './preload-intent';

// ---------------------------------------------------------------------------
// Fake factory
// ---------------------------------------------------------------------------

const makeFakeFactory = <TVariables extends Record<string, unknown>>(
	opts: {
		queryKey?: (vars: TVariables) => string[];
		fetcher?: (vars: TVariables) => Promise<unknown>;
		staleTime?: number;
	} = {},
): RoutePreloadFactory<TVariables> & { staleTime?: number } => ({
	queryKey: opts.queryKey ?? ((vars) => ['fake', JSON.stringify(vars)]),
	fetcher: opts.fetcher ?? (async () => ({ ok: true })),
	...('staleTime' in opts ? { staleTime: opts.staleTime } : {}),
});

// ---------------------------------------------------------------------------
// Router harness — a real router over a route that declares a preload entry,
// with the hook mounted in the shell. Navigation through `router.navigate`
// emits the `onBeforeLoad` event the hook subscribes to.
// ---------------------------------------------------------------------------

type Harness = {
	queryClient: QueryClient;
	// The app's registered-route types (declaration merging on `Register`)
	// fight the tiny test router's route types, so the harness exposes a
	// minimal navigate surface; the runtime value is the real router.
	router: { navigate: (opts: { to: string }) => Promise<void> };
	factory: RoutePreloadFactory<{ id: string }> & { staleTime?: number };
};

const mountHarness = async (
	opts: {
		factory?: RoutePreloadFactory<{ id: string }> & { staleTime?: number };
		queryCacheConfig?: { onError?: (error: unknown, query: unknown) => void };
		newEntryFetcherCalls?: () => void;
	} = {},
): Promise<Harness> => {
	const factory = opts.factory ?? makeFakeFactory<{ id: string }>();

	const queryClient = new QueryClient({
		queryCache: opts.queryCacheConfig
			? new QueryCache(opts.queryCacheConfig)
			: undefined,
	});

	const rootRoute = createRootRoute({
		staticData: { crumbs: 'shell' },
		component: () => {
			// The production hook mounts once in the authed CSR shell; here it
			// lives in the root layout, which is equivalent for event
			// subscription purposes.
			usePreloadIntentQueries();
			return <Outlet />;
		},
	});

	const indexPath = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		staticData: { crumbs: 'shell' },
		component: () => <div>index</div>,
	});

	const testRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/test',
		staticData: {
			crumbs: 'shell',
			preload: () => [{ options: factory, variables: { id: 'x' } }],
		},
		component: () => <div>test</div>,
	});

	const router = createRouter({
		routeTree: rootRoute.addChildren([indexPath, testRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		context: { queryClient },
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	render(
		<QueryClientProvider client={queryClient}>
			{/* the test router's type is inexpressible against the app's
			    registered `Register`; the runtime object is the real router */}
			<RouterProvider router={router as never} />
		</QueryClientProvider>,
	);

	// Let the hook's subscription effect run before any navigation: the whole
	// point of these tests is that the SUBSCRIBED hook responds to the
	// router's `onBeforeLoad` event, so navigation must not beat the effect.
	await new Promise((resolve) => setTimeout(resolve, 0));

	return {
		queryClient,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		router: router as unknown as Harness['router'],
		factory,
	};
};

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — the merged T1 stubs only asserted factory SHAPES; these exercise
// the hook's real behavior (a cold-cache preload must actually fetch, the
// fresh-cache path must not refetch, and a failing preload must stay silent
// AND must not trip the central 401→logout backstop).
// ---------------------------------------------------------------------------

describe('usePreloadIntentQueries', () => {
	test('a — navigation on a cold cache triggers the preload fetcher and warms the cache', async () => {
		const fetcher = vi.fn().mockResolvedValue({ ok: true, id: 'x' });
		const { queryClient, router } = await mountHarness({
			factory: makeFakeFactory<{ id: string }>({
				queryKey: (vars) => ['test', vars.id],
				fetcher,
			}),
		});

		await router.navigate({ to: '/test' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		// The fetcher must have been called with the entry's variables — this
		// is the regression the merged hook had: a bare `ensureQueryData({
		// queryKey })` (no queryFn, no app-wide defaultQueryFn) threw
		// `Missing queryFn` on a cold cache and never fetched at all.
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith({ id: 'x' });

		// And the cache must now hold the preloaded data under the factory key.
		await vi.waitFor(() => {
			expect(queryClient.getQueryData(['test', 'x'])).toEqual({
				ok: true,
				id: 'x',
			});
		});
	});

	test('b — a fresh cached entry causes zero additional fetches on repeat navigation', async () => {
		const fetcher = vi.fn().mockResolvedValue({ ok: true, id: 'x' });
		const { router } = await mountHarness({
			factory: makeFakeFactory<{ id: string }>({
				queryKey: (vars) => ['test', vars.id],
				fetcher,
				staleTime: 60_000,
			}),
		});

		await router.navigate({ to: '/test' });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fetcher).toHaveBeenCalledTimes(1);

		// Navigate away and back: the entry is still fresh (staleTime 60s), so
		// ensureQueryData must serve the cache and NOT fetch again.
		await router.navigate({ to: '/' });
		await router.navigate({ to: '/test' });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	test('c — a failing preload stays silent and marks the query so the 401→logout backstop skips it', async () => {
		const backstop = vi.fn();
		const authFailure = Object.assign(new Error('Unauthorized'), {
			responseStatusCode: 401,
			title: 'Unauthorized',
		});
		const { router } = await mountHarness({
			factory: makeFakeFactory<{ id: string }>({
				queryKey: (vars) => ['test', vars.id],
				fetcher: vi.fn().mockRejectedValue(authFailure),
			}),
			queryCacheConfig: { onError: backstop },
		});

		await router.navigate({ to: '/test' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		// The QueryCache onError DOES see the failed preload fetch…
		await vi.waitFor(() => {
			expect(backstop).toHaveBeenCalledTimes(1);
		});

		// …but the query it reports carries `meta.skipAuthedErrorBackstop:
		// true`, which is exactly the flag `handleAuthedQueryError` (router.tsx)
		// checks before calling `triggerSessionInvalidated` — the production
		// backstop will therefore skip it.
		const [error, query] = backstop.mock.calls[0] as unknown as [
			unknown,
			{ options?: { meta?: unknown } },
		];
		expect(error).toBe(authFailure);
		expect(query?.options?.meta).toEqual({ skipAuthedErrorBackstop: true });
	});
});
