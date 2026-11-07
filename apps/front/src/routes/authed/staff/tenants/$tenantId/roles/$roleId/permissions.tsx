import { createFileRoute } from '@tanstack/react-router';

import { RolePermissionsTab } from '../_role-permissions-tab';
import { staffTenantRoleCrumbsBase } from './_crumbs';
import { useStaffTenantRoleDetailsContext } from './_details-context';

const StaffTenantRolePermissionsSection = () => {
	const {
		tenantId,
		roleId,
		permissionKeys,
		permissionKeysRevision,
		permissionGroups,
		isCatalogPending,
		isCatalogError,
		catalogError,
		onPermissionsDirtyChange,
		onSessionExpired,
	} = useStaffTenantRoleDetailsContext();

	return (
		<RolePermissionsTab
			tenantId={tenantId}
			roleId={roleId}
			grantedKeys={permissionKeys}
			grantedRevision={permissionKeysRevision}
			permissionGroups={permissionGroups}
			isCatalogPending={isCatalogPending}
			isCatalogError={isCatalogError}
			catalogError={catalogError}
			onDirtyChange={onPermissionsDirtyChange}
			onSessionExpired={onSessionExpired}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/roles/$roleId/permissions',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-roles'],
		crumbs: (params) => [
			...staffTenantRoleCrumbsBase(params),
			{ kind: 'label', labelKey: 'common:permissions' },
		],
	},
	component: StaffTenantRolePermissionsSection,
});
