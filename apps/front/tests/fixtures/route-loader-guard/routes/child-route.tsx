import { createFileRoute } from '@tanstack/react-router';
import { preloadRouteQueries } from '~/lib/query/route-preload';

import {
	fakeStaffRolesQueryOptions,
	useFakeStaffRolesQuery,
} from '../lib/query/fake-staff-roles';

// GREEN: a child route with its own query and its own loader.
const childQueries = () => ({
	roles: { options: fakeStaffRolesQueryOptions, variables: { size: 1 } },
});

export const ChildPanel = () => {
	useFakeStaffRolesQuery(childQueries().roles.variables);
	return null;
};

export const Route = createFileRoute('/_authed-layout/child-route')({
	loader: ({ context }) => {
		preloadRouteQueries(context.queryClient, childQueries());
	},
	component: ChildPanel,
});
