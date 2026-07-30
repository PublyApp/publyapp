import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The new-profile flow moved into a drawer on the profiles tab (`?new=1`).
 * This route only exists so old links/bookmarks still land somewhere.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/new',
)({
	// Frozen legacy redirect stub (#972 allowlist) — never renders, so it
	// never supplies a trail.
	staticData: { crumbs: 'shell' },
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/staff/tenants/$tenantId/profiles',
			params: { tenantId: params.tenantId },
			search: { new: 1 },
		});
	},
	component: () => null,
});
