import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';

/**
 * #2340 — shared harness for the staff routes' `*.preload.test.tsx` files.
 *
 * It mounts the REAL route options under a throwaway two-route tree: a source
 * page holding a link to the destination, and the destination itself (nested
 * under a layout when the route is an index). `defaultPreload: 'intent'` +
 * `defaultPreloadStaleTime: 0` mirror the production router, so hovering the
 * link runs the route's real loader exactly as production does.
 */
export const widenOptions = <T,>(value: unknown): T => value as T;

const SOURCE_PATH = '/preload-source';

type RouteOptions = Record<string, unknown> & {
	loader?: unknown;
	loaderDeps?: unknown;
};

export type PreloadDestination = {
	/** URL the source page's link points at. */
	linkTo: string;
	/** Search the link carries (a non-default URL state). */
	linkSearch?: Record<string, string>;
	/** The destination route's path, relative to its parent. */
	path: string;
	/** A layout parent the destination nests under (the jobs index route). */
	parentPath?: string;
	options: RouteOptions;
};

const destinationOptions = (destination: PreloadDestination) => ({
	staticData: destination.options.staticData,
	validateSearch: destination.options.validateSearch,
	loaderDeps: destination.options.loaderDeps,
	loader: destination.options.loader,
	pendingComponent: destination.options.pendingComponent,
	errorComponent: destination.options.errorComponent,
	component: destination.options.component,
});

const buildRouter = ({
	queryClient,
	destination,
	linkLabel,
}: {
	queryClient: QueryClient;
	destination: PreloadDestination;
	linkLabel: string;
}) => {
	const rootRoute = createRootRoute({
		component: () => <Outlet />,
		staticData: { crumbs: 'shell' },
	});
	const sourceRoute = createRoute(
		widenOptions<Parameters<typeof createRoute>[0]>({
			getParentRoute: () => rootRoute,
			path: SOURCE_PATH,
			staticData: { crumbs: 'shell' },
			component: () => (
				<Link to={destination.linkTo} search={destination.linkSearch}>
					{linkLabel}
				</Link>
			),
		}),
	);

	const layoutRoute = destination.parentPath
		? createRoute(
				widenOptions<Parameters<typeof createRoute>[0]>({
					getParentRoute: () => rootRoute,
					path: destination.parentPath,
					staticData: { crumbs: 'shell' },
					component: () => <Outlet />,
				}),
			)
		: undefined;
	const destinationRoute = createRoute(
		widenOptions<Parameters<typeof createRoute>[0]>({
			...destinationOptions(destination),
			getParentRoute: () => layoutRoute ?? rootRoute,
			path: layoutRoute === undefined ? destination.path : '/',
		}),
	);
	const routeTree =
		layoutRoute === undefined
			? rootRoute.addChildren([sourceRoute, destinationRoute])
			: rootRoute.addChildren([
					sourceRoute,
					layoutRoute.addChildren([destinationRoute]),
				]);

	return createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree,
			history: createMemoryHistory({ initialEntries: [SOURCE_PATH] }),
			// `locale` is what the root `beforeLoad` publishes to every route.
			context: { queryClient, locale: 'en' },
			defaultPreload: 'intent',
			defaultPreloadStaleTime: 0,
		}),
	);
};

/** Renders the source page and returns the QueryClient the loader warmed. */
export const renderPreloadScenario = ({
	destination,
	linkLabel,
}: {
	destination: PreloadDestination;
	linkLabel: string;
}) => {
	// The production QueryClient default (`DEFAULT_QUERY_STALE_TIME_MS`,
	// router.tsx): preloaded data is fresh, so the page's own `useQuery` does
	// not refetch on mount.
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
	});

	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider
				router={buildRouter({ queryClient, destination, linkLabel })}
			/>
		</QueryClientProvider>,
	);

	return { queryClient };
};

/** Every query the loader warmed (the helper tags its fetches). */
export const preloadedQueries = (queryClient: QueryClient) =>
	queryClient
		.getQueryCache()
		.getAll()
		.filter((query) => query.meta?.routePreload === true);

export type PreloadedQuery = ReturnType<typeof preloadedQueries>[number];

/** Snapshot of the warmed keys' freshness, to prove the click refetched none. */
export const warmedSnapshot = (
	queries: PreloadedQuery[],
): Map<QueryKey, number> =>
	new Map(queries.map((query) => [query.queryKey, query.state.dataUpdatedAt]));

/** One fake Kiota call: the proxy path plus the handler arguments. */
export type FakeClientCall = {
	path: readonly string[];
	args: readonly unknown[];
};
export type FakeResponse = Record<string, unknown>;

export interface FakeApiClient {
	(): Promise<FakeResponse>;
	[segment: string]: FakeApiClient;
}

const HTTP_VERBS = new Set(['get', 'post', 'patch', 'delete', 'put']);

/** A Kiota client stand-in: `client.staff.users.get(...)` resolves through the
 * proxy to `respond({ path, args })`. */
export const buildFakeApiClient = (
	respond: (call: FakeClientCall) => FakeResponse | Promise<FakeResponse>,
): FakeApiClient => {
	const makeProxy = (path: readonly string[]): FakeApiClient =>
		new Proxy(() => {}, {
			get: (_target, prop) =>
				typeof prop === 'string' ? makeProxy([...path, prop]) : undefined,
			apply: (_target, _thisArg, args) => {
				const last = path[path.length - 1];
				if (last && HTTP_VERBS.has(last)) {
					return Promise.resolve(respond({ path, args }));
				}

				return makeProxy(path);
			},
		}) as FakeApiClient;

	return makeProxy([]);
};

export const pathEndsWith = (
	call: FakeClientCall,
	...suffix: string[]
): boolean => {
	const tail = call.path.slice(-suffix.length);
	return (
		tail.length === suffix.length &&
		suffix.every((segment, index) => tail[index] === segment)
	);
};

type RespondMock = { mock: { calls: readonly (readonly unknown[])[] } };

/** How many fake calls hit the endpoint whose path ends with `suffix`. */
export const countCallsByPath = (
	respond: RespondMock,
	...suffix: string[]
): number =>
	respond.mock.calls.filter((args) => {
		const call = args[0] as FakeClientCall | undefined;
		return call !== undefined && pathEndsWith(call, ...suffix);
	}).length;
