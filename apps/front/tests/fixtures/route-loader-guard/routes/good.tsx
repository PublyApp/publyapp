import { createFileRoute } from '@tanstack/react-router';
import { preloadRouteQueries } from '~/lib/query/route-preload';

import {
	fakeStaffUsersQueryOptions,
	useFakeStaffUsersQuery,
} from '../lib/query/fake-staff-users';

// GREEN: the page reads the factory the loader warms.
const goodQueries = () => ({
	users: { options: fakeStaffUsersQueryOptions, variables: { size: 1 } },
});

const Good = () => {
	useFakeStaffUsersQuery(goodQueries().users.variables);
	return null;
};

export const Route = createFileRoute('/_authed-layout/good')({
	loader: ({ context }) => {
		preloadRouteQueries(context.queryClient, goodQueries());
	},
	component: Good,
});
