import {
	staffTenantPermissionCatalogQueryOptions,
	staffTenantRoleDetailsQueryOptions,
	staffTenantRoleMembersQueryOptions,
	staffTenantRolePermissionKeysQueryOptions,
} from '~/lib/query/staff-tenant-roles';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';

// Members shown in the Overview avatar stack / preview before "View all".
// It uses the same canonical offset-paginated endpoint as the full Members tab.
export const MEMBERS_PREVIEW_LIMIT = 5;

type RoleDetailsQueryArgs = {
	tenantId: string;
	roleId: string;
	locale: string;
};

/**
 * The role-detail layout's queries, declared once: the loader warms them and
 * `useStaffTenantRoleDetails` reads the same variables. The page's `enabled`
 * gates (wait for the tenant query, drawer open, …) stay on the page — they
 * sequence rendering, they do not change the variables.
 */
export const roleDetailsQueries = ({
	tenantId,
	roleId,
	locale,
}: RoleDetailsQueryArgs) => ({
	tenantDetails: {
		options: staffTenantDetailsQueryOptions,
		variables: { tenantId },
	},
	roleDetails: {
		options: staffTenantRoleDetailsQueryOptions,
		variables: { tenantId, roleId },
	},
	permissionCatalog: {
		options: staffTenantPermissionCatalogQueryOptions,
		variables: { language: locale },
	},
	roleMembers: {
		options: staffTenantRoleMembersQueryOptions,
		variables: {
			tenantId,
			roleId,
			pageIndex: 0,
			size: MEMBERS_PREVIEW_LIMIT,
			sortId: 'created_at',
			sortOrder: 'desc' as const,
		},
	},
	rolePermissionKeys: {
		options: staffTenantRolePermissionKeysQueryOptions,
		variables: { tenantId, roleId },
	},
});
