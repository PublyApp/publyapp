import { createFileRoute } from '@tanstack/react-router';
import { preloadRouteQueries } from '~/lib/query/route-preload';

import { RoleMembersTab } from '../_role-members-tab';
import { staffTenantRoleCrumbsBase } from './_crumbs';
import { useStaffTenantRoleDetailsContext } from './_details-context';
import { roleMembersQueries } from './_queries';

const StaffTenantRoleMembersSection = () => {
	const { tenantId, roleId, role, onSessionExpired } =
		useStaffTenantRoleDetailsContext();

	return (
		<RoleMembersTab
			tenantId={tenantId}
			roleId={roleId}
			memberCount={role.userAccountCount}
			onSessionExpired={onSessionExpired}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/roles/$roleId/members',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-roles'],
		crumbs: (params) => [
			...staffTenantRoleCrumbsBase(params),
			{ kind: 'label', labelKey: 'common:members' },
		],
	},
	loader: ({ context, params }) => {
		preloadRouteQueries(
			context.queryClient,
			roleMembersQueries({
				tenantId: params.tenantId,
				roleId: params.roleId,
			}),
		);
	},
	component: StaffTenantRoleMembersSection,
});
