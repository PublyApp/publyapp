import type { QueryClient } from '@tanstack/react-query';

import {
	blockingRouteQuery,
	criticalRouteQuery,
	interactionRouteQuery,
	routeQueries,
	secondaryRouteQuery,
} from './route-queries';

const authOptions = {
	queryKey: ['auth'] as const,
	queryFn: async () => ({ id: 'user_1' }),
};

const detailsOptions = {
	queryKey: ['staff-user', 'user_1'] as const,
	queryFn: async () => ({ id: 'user_1' }),
};

const drawerOptions = {
	queryKey: ['drawer', 'user_1'] as const,
	queryFn: async () => ({ id: 'user_1' }),
};

const registry = routeQueries(({ userId }: { userId: string }) => ({
	auth: criticalRouteQuery(authOptions),
	details: blockingRouteQuery({
		...detailsOptions,
		queryKey: ['staff-user', userId] as const,
	}),
	drawer: interactionRouteQuery(drawerOptions),
	disabledDetails: secondaryRouteQuery({
		...detailsOptions,
		enabled: false,
		queryKey: ['staff-user', userId, 'disabled'] as const,
	}),
	metrics: secondaryRouteQuery({
		queryKey: ['metrics', userId] as const,
		queryFn: async () => ({ count: 1 }),
	}),
}));

const assertRouteQueriesTypes = async (queryClient: QueryClient) => {
	registry.preload(queryClient, { userId: 'user_1' });
	await registry.preloadBlocking(queryClient, { userId: 'user_1' });

	const built = registry.build({ userId: 'user_1' });

	built.auth.options.queryKey satisfies readonly ['auth'];
	built.details.blocking satisfies true;
	built.drawer.priority satisfies 'interaction';
	built.disabledDetails.options.enabled satisfies boolean;
	built.metrics.priority satisfies 'secondary';
};

void assertRouteQueriesTypes;
