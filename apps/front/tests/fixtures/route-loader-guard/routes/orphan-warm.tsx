import { createFileRoute } from '@tanstack/react-router';
import { preloadRouteQueries } from '~/lib/query/route-preload';

import { fakeStaffUsersQueryOptions } from '../lib/query/fake-staff-users';

// RED: the loader warms a key the page never reads.
const orphanQueries = () => ({
	users: { options: fakeStaffUsersQueryOptions, variables: { size: 1 } },
});

const OrphanWarm = () => null;

export const Route = createFileRoute('/_authed-layout/orphan-warm')({
	loader: ({ context }) => {
		preloadRouteQueries(context.queryClient, orphanQueries());
	},
	component: OrphanWarm,
});
