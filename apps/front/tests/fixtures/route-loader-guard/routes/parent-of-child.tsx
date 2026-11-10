import { createFileRoute } from '@tanstack/react-router';
import { preloadRouteQueries } from '~/lib/query/route-preload';

import {
	fakeStaffUsersQueryOptions,
	useFakeStaffUsersQuery,
} from '../lib/query/fake-staff-users';
import { ChildPanel } from './child-route';

// GREEN: renders the child route's component, but the walk stops at the child
// route, so the child's query is not attributed to this parent.
const parentQueries = () => ({
	users: { options: fakeStaffUsersQueryOptions, variables: { size: 1 } },
});

const ParentOfChild = () => {
	useFakeStaffUsersQuery(parentQueries().users.variables);
	return <ChildPanel />;
};

export const Route = createFileRoute('/_authed-layout/parent-of-child')({
	loader: ({ context }) => {
		preloadRouteQueries(context.queryClient, parentQueries());
	},
	component: ParentOfChild,
});
