import { createFileRoute } from '@tanstack/react-router';
import { preloadRouteQueries } from '~/lib/query/route-preload';

import {
	fakeStaffUsersQueryOptions,
	useFakeStaffUsersQuery,
} from '../lib/query/fake-staff-users';
import { warmElsewhere } from '../lib/query/fake-warmer';

// RED: the loader also calls an imported warmer the guard cannot read.
const opaqueQueries = () => ({
	users: { options: fakeStaffUsersQueryOptions, variables: { size: 1 } },
});

const OpaqueLoaderCall = () => {
	useFakeStaffUsersQuery({ size: 1 });
	return null;
};

export const Route = createFileRoute('/_authed-layout/opaque-loader-call')({
	loader: async ({ context }) => {
		preloadRouteQueries(context.queryClient, opaqueQueries());
		await warmElsewhere(context.queryClient);
	},
	component: OpaqueLoaderCall,
});
