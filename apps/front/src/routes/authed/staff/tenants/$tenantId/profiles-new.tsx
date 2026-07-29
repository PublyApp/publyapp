import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The new-profile flow moved into a drawer on the profiles tab (`?new=1`).
 * This route only exists so old links/bookmarks still land somewhere.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/new',
)({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/staff/tenants/$tenantId/profiles',
			params: { tenantId: params.tenantId },
			search: { new: 1 },
		});
	},
	component: () => null,
});
