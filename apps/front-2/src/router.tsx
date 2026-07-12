import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

import { routeTree } from './routeTree.gen';

// A tab refocus triggers TanStack Query's `refetchOnWindowFocus` for every
// mounted query whose data is stale. With the library default (staleTime: 0)
// that means every single mounted query on the page, every time — a request
// stampede on every alt-tab back to the app. 30s keeps focus-triggered
// revalidation for genuinely idle-too-long data while collapsing the common
// case (glance away, glance back) into a no-op.
const DEFAULT_QUERY_STALE_TIME_MS = 30_000;

export function getRouter() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: DEFAULT_QUERY_STALE_TIME_MS,
			},
		},
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
