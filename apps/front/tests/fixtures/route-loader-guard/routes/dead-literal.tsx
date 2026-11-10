import { createFileRoute } from '@tanstack/react-router';
import { preloadRouteQueries } from '~/lib/query/route-preload';

import {
	fakeStaffRolesQueryOptions,
	useFakeStaffRolesQuery,
} from '../lib/query/fake-staff-roles';
import {
	fakeStaffUsersQueryOptions,
	useFakeStaffUsersQuery,
} from '../lib/query/fake-staff-users';

// RED: `neverReturned` is a leftover literal, not part of the returned spec,
// so the loader never warms the users query the page reads.
const deadLiteralQueries = () => {
	const neverReturned = {
		options: fakeStaffUsersQueryOptions,
		variables: { size: 1 },
	};
	void neverReturned;
	return {
		roles: { options: fakeStaffRolesQueryOptions, variables: { size: 1 } },
	};
};

const DeadLiteral = () => {
	useFakeStaffUsersQuery({ size: 1 });
	useFakeStaffRolesQuery({ size: 1 });
	return null;
};

export const Route = createFileRoute('/_authed-layout/dead-literal')({
	loader: ({ context }) => {
		preloadRouteQueries(context.queryClient, deadLiteralQueries());
	},
	component: DeadLiteral,
});
