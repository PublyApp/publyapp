import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Old `/staff/tenant-users/details/:userId` bookmarks land on the general
 * tab (old-front parity). This route never renders, so it never supplies a
 * breadcrumb trail (#972 frozen-stub pattern).
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenant-users/details/$userId',
)({
	staticData: { crumbs: 'shell' },
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/staff/tenant-users/details/$userId/general',
			params: { userId: params.userId },
		});
	},
	component: () => null,
});
