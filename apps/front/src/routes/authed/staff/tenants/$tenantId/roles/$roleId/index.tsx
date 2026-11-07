import { createFileRoute, redirect } from '@tanstack/react-router';

import {
	parseRoleOverviewSearchParams,
	type RoleOverviewSearchParamInput,
} from '../_role-details-search';
import { RoleOverviewTab } from '../_role-overview-tab';
import { staffTenantRoleCrumbsBase } from './_crumbs';
import { useStaffTenantRoleDetailsContext } from './_details-context';

const StaffTenantRoleOverviewSection = () => {
	const {
		tenantId,
		role,
		permissionKeys,
		permissionGroups,
		isCatalogPending,
		isCatalogError,
		members,
		membersPending,
		membersError,
		locale,
		onDeleteRequest,
		isDeletePending,
	} = useStaffTenantRoleDetailsContext();

	return (
		<RoleOverviewTab
			tenantId={tenantId}
			role={role}
			permissionKeys={permissionKeys}
			permissionGroups={permissionGroups}
			isCatalogPending={isCatalogPending}
			isCatalogError={isCatalogError}
			members={members}
			membersPending={membersPending}
			membersError={membersError}
			locale={locale}
			onDeleteRequest={onDeleteRequest}
			isDeletePending={isDeletePending}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/roles/$roleId/',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-roles'],
		crumbs: staffTenantRoleCrumbsBase,
	},
	validateSearch: (search) =>
		parseRoleOverviewSearchParams(search as RoleOverviewSearchParamInput),
	// Legacy `?tab=` links are in the wild (bookmarks, pasted URLs). Silently
	// ignoring one would land the visitor on Overview and read as data loss,
	// so send them to the section they asked for and drop the param — the
	// redirect's `search` object REPLACES the search, which is what removes
	// `tab` from the address bar. `replace: true` keeps the legacy entry out
	// of the history stack, so a Back from the section does not bounce
	// straight back through this redirect.
	beforeLoad: ({ params, search }) => {
		if (!search.tab) {
			return;
		}

		throw redirect({
			to:
				search.tab === 'permissions'
					? '/staff/tenants/$tenantId/roles/$roleId/permissions'
					: '/staff/tenants/$tenantId/roles/$roleId/members',
			params: { tenantId: params.tenantId, roleId: params.roleId },
			search: { edit: search.edit },
			replace: true,
		});
	},
	component: StaffTenantRoleOverviewSection,
});
