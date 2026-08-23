import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Unknown-tab fallback: any `/staff/tenant-users/details/$userId/<other>`
 * deep link redirects to the general tab instead of rendering a broken tab.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenant-users/details/$userId/$tab',
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
