import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The invite-user flow moved into a drawer on the users tab (`?invite=1`).
 * This route only exists so old links/bookmarks still land somewhere.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/invite',
)({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/staff/tenants/$tenantId/users',
			params: { tenantId: params.tenantId },
			search: { invite: 1 },
		});
	},
	component: () => null,
});
