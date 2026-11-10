/**
 * @vitest-environment jsdom
 */
import {
	QueryCache,
	QueryClient,
	QueryClientProvider,
	useQuery,
} from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import QueryDisplay from '~/components/query-display';
import { handleAuthedQueryError } from '~/router';

import {
	preloadRouteQueries,
	type RouteInfiniteQueryOptions,
	type RouteQueryOptions,
	type RouteQuerySpecEntry,
} from './route-preload';

const mocks = vi.hoisted(() => ({
	loggerWarn: vi.fn(),
	triggerSessionInvalidated: vi.fn(),
}));

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		warn: mocks.loggerWarn,
		error: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock('~/lib/session/session-invalidation-channel', () => ({
	triggerSessionInvalidated: mocks.triggerSessionInvalidated,
}));

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	displayMutationFeedback: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-i18next')>();

	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
			i18n: { language: 'en' },
		}),
	};
});

const UNAUTHORIZED = { responseStatusCode: 401, title: 'Unauthorized' };

/** The throwaway routes below are not part of the generated route tree, so the
 * Register-constrained option types reject them; widen at the create call. */
const widen = <T,>(value: unknown): T => value as T;

type DeferredRejection = { reject?: (reason?: unknown) => void };

const buildQueryClient = (options: { staleTime?: number } = {}): QueryClient =>
	new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: options.staleTime },
		},
		queryCache: new QueryCache({ onError: handleAuthedQueryError }),
	});

type HarnessOptions = {
	queryClient: QueryClient;
	spec: Record<string, RouteQuerySpecEntry>;
	homeComponent?: () => ReactNode;
	destComponent?: () => ReactNode;
};

/** Throwaway two-route tree: `/` links to `/staff` (a real path in the
 * generated tree, so `Link`'s literal types accept it), whose loader is the
 * real `preloadRouteQueries` call a covered route would declare.
 * `defaultPreload: 'intent'` + `defaultPreloadStaleTime: 0` mirror the
 * production router, so a second hover really re-runs the loader (the router
 * never masks the query cache's own freshness). */
const renderHarness = ({
	queryClient,
	spec,
	homeComponent,
	destComponent,
}: HarnessOptions) => {
	let loaderRuns = 0;
	const rootRoute = createRootRoute({
		component: () => <Outlet />,
		staticData: { crumbs: 'shell' },
	});
	const homeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		staticData: { crumbs: 'shell' },
		component:
			homeComponent ??
			(() => (
				<div>
					<Link to="/staff">go to dest</Link>
				</div>
			)),
	});
	// The throwaway tree is not the generated one: widen its options exactly as
	// the $roleId loader test does, so the Register-constrained literals do not
	// reject it.
	const destRoute = createRoute(
		widen<Parameters<typeof createRoute>[0]>({
			getParentRoute: () => rootRoute,
			path: '/staff',
			staticData: { crumbs: 'shell' },
			loader: ({ context }: { context: { queryClient: QueryClient } }) => {
				loaderRuns += 1;
				preloadRouteQueries(context.queryClient, spec);
			},
			component:
				destComponent ?? (() => <div data-testid="dest-page">dest</div>),
		}),
	);
	const router = createRouter(
		widen<Parameters<typeof createRouter>[0]>({
			routeTree: rootRoute.addChildren([homeRoute, destRoute]),
			history: createMemoryHistory({ initialEntries: ['/'] }),
			context: { queryClient },
			defaultPreload: 'intent',
			defaultPreloadStaleTime: 0,
		}),
	);

	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);

	return { router, loaderRuns: () => loaderRuns };
};

const hoverOnce = async (
	link: HTMLElement,
	harness: ReturnType<typeof renderHarness>,
	queryClient: QueryClient,
): Promise<void> => {
	const before = harness.loaderRuns();
	fireEvent.mouseEnter(link);
	await waitFor(() => expect(harness.loaderRuns()).toBe(before + 1));
	await waitFor(() => expect(queryClient.isFetching()).toBe(0));
};

const findDestLink = async (): Promise<HTMLElement> =>
	await screen.findByRole('link', { name: 'go to dest' });

beforeEach(() => {
	window.history.pushState({}, '', '/staff/staff-users');
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('preloadRouteQueries', () => {
	test('a cold hover fetches the destination query exactly once, without navigating', async () => {
		const fetcher = vi.fn(async () => ({ ok: true }));
		const options: RouteQueryOptions = {
			queryKey: () => ['preload-cold'],
			fetcher,
		};
		const queryClient = buildQueryClient();
		const harness = renderHarness({
			queryClient,
			spec: { cold: { options, variables: undefined } },
		});

		const link = await findDestLink();
		expect(fetcher).not.toHaveBeenCalled();

		await hoverOnce(link, harness, queryClient);

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId('dest-page')).toBeNull();
	});

	test('a warm hover does not refetch when the factory declares no staleTime (C1)', async () => {
		const fetcher = vi.fn(async () => ({ ok: true }));
		const options: RouteQueryOptions = {
			queryKey: () => ['preload-warm'],
			fetcher,
		};
		const queryClient = buildQueryClient({ staleTime: 60_000 });
		const harness = renderHarness({
			queryClient,
			spec: { warm: { options, variables: undefined } },
		});

		const link = await findDestLink();
		await hoverOnce(link, harness, queryClient);
		await hoverOnce(link, harness, queryClient);

		expect(fetcher).toHaveBeenCalledTimes(1);
		const entry = queryClient
			.getQueryCache()
			.find({ queryKey: ['preload-warm'], exact: true });
		expect(
			(entry?.options as { staleTime?: number } | undefined)?.staleTime,
		).toBe(60_000);
	});

	test('a failing preload is silent, then the page shows its own error', async () => {
		const fetcher = vi.fn(async () => {
			throw new Error('boom');
		});
		const options: RouteQueryOptions = {
			queryKey: () => ['preload-fail'],
			fetcher,
		};
		const queryClient = buildQueryClient();
		const DestPage = () => {
			const query = useQuery({
				queryKey: ['preload-fail'],
				queryFn: () => fetcher(),
			});

			return (
				<QueryDisplay
					query={query}
					ErrorSlot={<div data-testid="dest-error">error</div>}
				/>
			);
		};
		const harness = renderHarness({
			queryClient,
			spec: { failing: { options, variables: undefined } },
			destComponent: DestPage,
		});

		const link = await findDestLink();
		await hoverOnce(link, harness, queryClient);

		expect(mocks.loggerWarn).toHaveBeenCalledTimes(1);
		expect(mocks.triggerSessionInvalidated).not.toHaveBeenCalled();
		expect(screen.queryByTestId('dest-error')).toBeNull();
		expect(screen.queryByTestId('dest-page')).toBeNull();

		fireEvent.click(link);

		expect(await screen.findByTestId('dest-error')).toBeTruthy();
	});

	test('an expired session does not log out on hover, but does when the click lands during the pending preload', async () => {
		const pending: DeferredRejection = {};
		const fetcher = vi.fn(
			() =>
				new Promise<unknown>((_resolve, reject) => {
					pending.reject = reject;
				}),
		);
		const options: RouteQueryOptions = {
			queryKey: () => ['preload-expired'],
			fetcher,
		};
		const queryClient = buildQueryClient();
		const DestPage = () => {
			useQuery({ queryKey: ['preload-expired'], queryFn: () => fetcher() });

			return <div data-testid="dest-page">dest</div>;
		};
		renderHarness({
			queryClient,
			spec: { expired: { options, variables: undefined } },
			destComponent: DestPage,
		});

		const link = await findDestLink();
		fireEvent.mouseEnter(link);
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

		fireEvent.click(link);
		expect(await screen.findByTestId('dest-page')).toBeTruthy();

		pending.reject?.(UNAUTHORIZED);

		await waitFor(() =>
			expect(mocks.triggerSessionInvalidated).toHaveBeenCalledTimes(1),
		);
	});

	test('an expired session on a hover with nothing rendered stays silent', async () => {
		const pending: DeferredRejection = {};
		const fetcher = vi.fn(
			() =>
				new Promise<unknown>((_resolve, reject) => {
					pending.reject = reject;
				}),
		);
		const options: RouteQueryOptions = {
			queryKey: () => ['preload-expired-silent'],
			fetcher,
		};
		const queryClient = buildQueryClient();
		renderHarness({
			queryClient,
			spec: { expired: { options, variables: undefined } },
		});

		const link = await findDestLink();
		fireEvent.mouseEnter(link);
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

		pending.reject?.(UNAUTHORIZED);

		await waitFor(() => expect(mocks.loggerWarn).toHaveBeenCalledTimes(1));
		expect(mocks.triggerSessionInvalidated).not.toHaveBeenCalled();
	});

	test('a query an already-mounted page observes is never re-warmed (M3)', async () => {
		const fetcher = vi.fn(async () => {
			if (fetcher.mock.calls.length > 1) {
				throw UNAUTHORIZED;
			}
			return { ok: true };
		});
		const HomePage = () => {
			const query = useQuery({
				queryKey: ['preload-mounted'],
				queryFn: () => fetcher(),
			});

			return (
				<div>
					<Link to="/staff">go to dest</Link>
					<span data-testid="home-status">{query.status}</span>
				</div>
			);
		};
		const options: RouteQueryOptions = {
			queryKey: () => ['preload-mounted'],
			fetcher,
		};
		const queryClient = buildQueryClient({ staleTime: 0 });
		const harness = renderHarness({
			queryClient,
			spec: { mounted: { options, variables: undefined } },
			homeComponent: HomePage,
		});

		await waitFor(() =>
			expect(screen.getByTestId('home-status').textContent).toBe('success'),
		);
		expect(fetcher).toHaveBeenCalledTimes(1);

		await hoverOnce(await findDestLink(), harness, queryClient);

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(mocks.triggerSessionInvalidated).not.toHaveBeenCalled();
	});

	test('a staleTime: Infinity factory is never refetched (M2)', async () => {
		const fetcher = vi.fn(async () => ({ ok: true }));
		const options: RouteQueryOptions = {
			queryKey: () => ['preload-session-stable'],
			fetcher,
			staleTime: Infinity,
		};
		const queryClient = buildQueryClient({ staleTime: 0 });
		const harness = renderHarness({
			queryClient,
			spec: { stable: { options, variables: undefined } },
		});

		const link = await findDestLink();
		await hoverOnce(link, harness, queryClient);
		await hoverOnce(link, harness, queryClient);

		expect(fetcher).toHaveBeenCalledTimes(1);
		const entry = queryClient
			.getQueryCache()
			.find({ queryKey: ['preload-session-stable'], exact: true });
		expect(
			(entry?.options as { staleTime?: number } | undefined)?.staleTime,
		).toBe(Infinity);
	});

	test('a synchronously throwing fetcher or queryKey never escapes', async () => {
		const queryClient = buildQueryClient();
		const spec = {
			throwingFetcher: {
				options: {
					queryKey: () => ['preload-throwing-fetcher'],
					fetcher: () => {
						throw new Error('boom');
					},
				},
				variables: undefined,
			},
			throwingKey: {
				options: {
					queryKey: () => {
						throw new Error('boom-key');
					},
					fetcher: async () => ({ ok: true }),
				},
				variables: undefined,
			},
		} satisfies Record<string, RouteQuerySpecEntry>;

		expect(() => preloadRouteQueries(queryClient, spec)).not.toThrow();
		await waitFor(() => expect(mocks.loggerWarn).toHaveBeenCalledTimes(2));
	});

	test('an infinite entry warms the { pages, pageParams } shape with the page signal', async () => {
		const fetcher = vi.fn(
			async (
				_variables: Record<string, never>,
				pageParam: unknown,
				signal?: AbortSignal,
			) => ({ pageParam, aborted: signal?.aborted ?? null }),
		);
		const options: RouteInfiniteQueryOptions = {
			queryKey: () => ['preload-infinite'],
			fetcher,
			initialPageParam: undefined,
			getNextPageParam: () => undefined,
		};
		const queryClient = buildQueryClient();

		preloadRouteQueries(queryClient, {
			infinite: { options, variables: undefined },
		});

		await waitFor(() => expect(queryClient.isFetching()).toBe(0));

		const data = queryClient.getQueryData(['preload-infinite']);
		expect(Array.isArray(data)).toBe(false);
		expect(data).toEqual({
			pages: [{ pageParam: undefined, aborted: false }],
			pageParams: [undefined],
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
});
