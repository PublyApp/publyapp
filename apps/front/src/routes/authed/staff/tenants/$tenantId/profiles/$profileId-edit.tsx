import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The edit-profile flow moved into a drawer on the profile detail page
 * (`?edit=1`). This route only exists so old links/bookmarks still land
 * somewhere.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/edit',
)({
	// Frozen legacy redirect stub (#972 allowlist) — never renders, so it
	// never supplies a trail.
	staticData: { crumbs: 'shell' },
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/staff/tenants/$tenantId/profiles/$profileId',
			params: {
				tenantId: params.tenantId,
				profileId: params.profileId,
			},
			search: { edit: 1 },
		});
	},
	component: () => null,
});
