import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The invite-user flow moved into a drawer on the users tab (`?invite=1`).
 * This route only exists so old links/bookmarks still land somewhere.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/invite',
)({
	// Frozen legacy redirect stub (#972 allowlist) — never renders, so it
	// never supplies a trail.
	staticData: { crumbs: 'shell' },
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/staff/tenants/$tenantId/users',
			params: { tenantId: params.tenantId },
			search: { invite: 1 },
		});
	},
	component: () => null,
});
