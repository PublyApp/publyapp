import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The edit-role flow moved into a drawer on the role detail page
 * (`?edit=1`). This route only exists so old links/bookmarks still land
 * somewhere.
 */
export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/roles/$roleId/edit',
)({
	// Frozen legacy redirect stub (#972 allowlist) — never renders, so it
	// never supplies a trail.
	staticData: { crumbs: 'shell' },
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/staff/tenants/$tenantId/roles/$roleId',
			params: {
				tenantId: params.tenantId,
				roleId: params.roleId,
			},
			search: { edit: 1 },
		});
	},
	component: () => null,
});
