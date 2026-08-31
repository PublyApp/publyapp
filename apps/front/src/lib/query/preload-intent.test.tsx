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
import type { AnyRouter } from '@tanstack/router-core';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RoutePreloadFactory } from '~/lib/navigation/route-preload';

import { usePreloadIntentQueries } from './preload-intent';

// ---------------------------------------------------------------------------
// Fake factory — typed precisely so the assertion surface is real, not a cast
// ---------------------------------------------------------------------------

type FakePayload = { ok: boolean; id: string };

type FakeFactoryOptions<TVariables extends Record<string, unknown>> = {
	queryKey?: (vars: TVariables) => readonly unknown[];
	fetcher?: (vars: TVariables) => Promise<FakePayload>;
	staleTime?: number;
};

type FakeFactory<TVariables extends Record<string, unknown>> = {
	queryKey: (variables: TVariables) => readonly unknown[];
	fetcher: (variables: TVariables) => Promise<FakePayload>;
	staleTime?: number;
};

const makeFakeFactory = <TVariables extends Record<string, unknown>>(
	opts: FakeFactoryOptions<TVariables> = {},
): FakeFactory<TVariables> => {
	const factory: FakeFactory<TVariables> = {
		queryKey: opts.queryKey ?? ((vars) => ['fake', vars]),
		fetcher: opts.fetcher ?? (async (vars) => ({ ok: true, id: vars.id })),
	};
	if ('staleTime' in opts) {
		factory.staleTime = opts.staleTime;
	}
	return factory;
};

// Adapt the test factory to the production `RoutePreloadFactory<TVariables>`
// contract. The production shape is the source of truth (§1.2 / plan §3); the
// test factory uses a precise return type locally and widens it at this single
// boundary so the test is not a fiction.
const asRoutePreloadFactory = <TVariables extends Record<string, unknown>>(
	factory: FakeFactory<TVariables>,
): RoutePreloadFactory<TVariables> & { staleTime?: number } => factory;

// ---------------------------------------------------------------------------
// Router harness — mount the hook inside a real React component, so the
// `rules-of-hooks` check sees a component, not an anonymous function. The
// router's `matchRoutes` returns a `MakeRouteMatchUnion[]` whose `staticData`
// is part of the public type, so the test exercises the live navigation path
// (no synthetic match construction, no `as any`, no `as never`).
// ---------------------------------------------------------------------------

type HarnessRouter = {
	navigate: (opts: { to: string }) => Promise<void>;
};

type Harness = {
	queryClient: QueryClient;
	router: HarnessRouter;
};

const mountHarness = async (
	factory: FakeFactory<{ id: string }>,
	queryCacheConfig?: { onError: (error: unknown, query: unknown) => void },
): Promise<Harness> => {
	const queryClient = new QueryClient({
		queryCache: queryCacheConfig ? new QueryCache(queryCacheConfig) : undefined,
	});

	// Mount the hook inside the root route's component so React's rules of
	// hooks see a component boundary. The production code mounts the same
	// hook in the authed CSR shell (`AppShell`, `ssr: false`); the root
	// route's component is the equivalent location for the test router.
	const rootRoute = createRootRoute({
		component: HookMountingRoot,
	});

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: () => <div>index</div>,
	});

	const testRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/test',
		staticData: {
			preload: () => [
				{
					options: asRoutePreloadFactory(factory),
					variables: { id: 'x' },
				},
			],
		},
		component: () => <div>test</div>,
	});

	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute, testRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		context: { queryClient },
	});

	// The test tree is a tiny isolated route tree, narrower than the app's
	// registered `Router` type. Assign it through `AnyRouter` so the prop
	// type fits without a chained assertion.
	const anyRouter: AnyRouter = router;

	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={anyRouter} />
		</QueryClientProvider>,
	);

	// Let the hook's subscription effect run before any navigation: the
	// whole point of these tests is that the SUBSCRIBED hook responds to
	// the router's `onBeforeLoad` event, so navigation must not beat the
	// effect.
	await new Promise((resolve) => setTimeout(resolve, 0));

	return {
		queryClient,
		router: router satisfies HarnessRouter,
	};
};

const HookMountingRoot = () => {
	usePreloadIntentQueries();
	return <Outlet />;
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
		const factory = makeFakeFactory<{ id: string }>({
			queryKey: (vars) => ['test', vars.id],
			fetcher,
		});
		const { queryClient, router } = await mountHarness(factory);

		await router.navigate({ to: '/test' });

		// The fetcher must have been called with the entry's variables — this
		// is the regression the merged hook had: a bare `ensureQueryData({
		// queryKey })` (no queryFn, no app-wide defaultQueryFn) threw
		// `Missing queryFn` on a cold cache and never fetched at all.
		await waitFor(() => {
			expect(fetcher).toHaveBeenCalledTimes(1);
		});
		expect(fetcher).toHaveBeenCalledWith({ id: 'x' });

		// The cache-warming proof the merged T1 lacked: the entry must be
		// present in the queryClient state, not just "the call did not
		// throw". `getQueryData` returns the warmed payload; the cache
		// entry itself is observable through `getQueryCache().find`.
		await waitFor(() => {
			expect(queryClient.getQueryData(['test', 'x'])).toEqual({
				ok: true,
				id: 'x',
			});
		});
		const cached = queryClient
			.getQueryCache()
			.find({ queryKey: ['test', 'x'] });
		expect(cached).toBeDefined();
		expect(cached?.state.status).toBe('success');
		expect(cached?.state.fetchStatus).toBe('idle');
	});

	test('b — a fresh cached entry causes zero additional fetches on repeat navigation', async () => {
		const fetcher = vi.fn().mockResolvedValue({ ok: true, id: 'x' });
		const factory = makeFakeFactory<{ id: string }>({
			queryKey: (vars) => ['test', vars.id],
			fetcher,
			staleTime: 60_000,
		});
		const { router } = await mountHarness(factory);

		await router.navigate({ to: '/test' });
		await waitFor(() => {
			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		// Navigate away and back: the entry is still fresh (staleTime 60s),
		// so `queryClient.query` (the replacement for `ensureQueryData`)
		// must serve the cache and NOT fetch again.
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
		const fetcher = vi.fn().mockRejectedValue(authFailure);
		const factory = makeFakeFactory<{ id: string }>({
			queryKey: (vars) => ['test', vars.id],
			fetcher,
		});
		const { queryClient, router } = await mountHarness(factory, {
			onError: backstop,
		});

		await router.navigate({ to: '/test' });

		// The QueryCache onError DOES see the failed preload fetch…
		await waitFor(() => {
			expect(backstop).toHaveBeenCalledTimes(1);
		});

		const [error] = backstop.mock.calls[0] as Parameters<
			(error: unknown, query: unknown) => void
		>;
		expect(error).toBe(authFailure);

		// …but the query it reports carries
		// `meta.skipAuthedErrorBackstop: true`, which is exactly the flag
		// `handleAuthedQueryError` (router.tsx) checks before calling
		// `triggerSessionInvalidated` — the production backstop will
		// therefore skip it. The query is observable through the live
		// `Query` type, not a hand-cast fiction.
		const cached = queryClient
			.getQueryCache()
			.find({ queryKey: ['test', 'x'] });
		expect(cached).toBeDefined();
		expect(cached?.state.status).toBe('error');
		expect(cached?.options.meta).toEqual({ skipAuthedErrorBackstop: true });
	});
});
