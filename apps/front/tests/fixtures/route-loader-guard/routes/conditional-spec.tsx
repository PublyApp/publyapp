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

// GREEN, pins the union: the returned `spec` is conditional, and a
// branch-gated entry (`users`) is still a key the loader may warm, so the page
// reading it is not cold.
const conditionalQueries = ({ gated }: { gated: boolean }) => {
	const users = { options: fakeStaffUsersQueryOptions, variables: { size: 1 } };
	const roles = { options: fakeStaffRolesQueryOptions, variables: { size: 1 } };
	const spec = gated ? { users, roles } : { roles };
	return { users, roles, spec };
};

const ConditionalSpec = () => {
	useFakeStaffUsersQuery({ size: 1 });
	useFakeStaffRolesQuery({ size: 1 });
	return null;
};

export const Route = createFileRoute('/_authed-layout/conditional-spec')({
	loader: ({ context }) => {
		preloadRouteQueries(
			context.queryClient,
			conditionalQueries({ gated: true }).spec,
		);
	},
	component: ConditionalSpec,
});
