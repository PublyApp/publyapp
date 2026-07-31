import { createFileRoute } from '@tanstack/react-router';

import { ProfilePermissionsTab } from '../_profile-permissions-tab';
import { staffTenantProfileCrumbsBase } from './_crumbs';
import { useStaffTenantProfileDetailsContext } from './_details-context';

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/permissions',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
		crumbs: (params) => [
			...staffTenantProfileCrumbsBase(params),
			{ kind: 'label', labelKey: 'common:permissions' },
		],
	},
	component: StaffTenantProfilePermissionsSection,
});

function StaffTenantProfilePermissionsSection() {
	const {
		tenantId,
		profileId,
		permissionKeys,
		permissionKeysRevision,
		permissionGroups,
		isCatalogPending,
		isCatalogError,
		catalogError,
		onPermissionsDirtyChange,
		onSessionExpired,
	} = useStaffTenantProfileDetailsContext();

	return (
		<ProfilePermissionsTab
			tenantId={tenantId}
			profileId={profileId}
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
}
