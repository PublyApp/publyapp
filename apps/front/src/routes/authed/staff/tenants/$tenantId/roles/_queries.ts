import { buildTableApiVariables } from '~/components/table/use-table-controller';
import {
	staffTenantPermissionCatalogQueryOptions,
	staffTenantRolesQueryOptions,
} from '~/lib/query/staff-tenant-roles';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';

import {
	type StaffTenantRolesSearchParams,
	toStaffTenantRoleTypeFilterString,
} from './_roles-search-params';

export const ROLES_DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
export const ROLES_DEFAULT_SIZE = 100;

/** The permission catalog the (always mounted) create drawer reads. */
export const rolePermissionCatalogQuery = (locale: string) => ({
	options: staffTenantPermissionCatalogQueryOptions,
	variables: { language: locale },
});

/**
 * The tenant roles list's own queries: tenant and roles list. The cursor
 * lives in React state, so the loader warms the first page (decision 4).
 */
export const tenantRolesListQueries = ({
	tenantId,
	search,
}: {
	tenantId: string;
	search: StaffTenantRolesSearchParams;
}) => {
	const { q, sortId, sortOrder, size } = buildTableApiVariables(
		search,
		ROLES_DEFAULT_SORT,
		ROLES_DEFAULT_SIZE,
	);

	return {
		details: {
			options: staffTenantDetailsQueryOptions,
			variables: { tenantId },
		},
		roles: {
			options: staffTenantRolesQueryOptions,
			variables: {
				tenantId,
				q,
				sortId,
				sortOrder,
				size,
				isFullAccess: toStaffTenantRoleTypeFilterString(search.is_full_access),
			},
		},
	};
};

/** Everything the roles page reads: the list queries plus the create drawer's
 * catalog. The loader warms this; the hook and the drawer read their parts. */
export const tenantRolesQueries = ({
	tenantId,
	search,
	locale,
}: {
	tenantId: string;
	search: StaffTenantRolesSearchParams;
	locale: string;
}) => ({
	...tenantRolesListQueries({ tenantId, search }),
	permissionCatalog: rolePermissionCatalogQuery(locale),
});
