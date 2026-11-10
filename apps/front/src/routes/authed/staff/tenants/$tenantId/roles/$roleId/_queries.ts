import { buildTableApiVariables } from '~/components/table/use-table-controller';
import type { RouteQuerySpecEntry } from '~/lib/query/route-preload';
import {
	staffTenantPermissionCatalogQueryOptions,
	staffTenantRoleDetailsQueryOptions,
	staffTenantRoleMembersQueryOptions,
	staffTenantRolePermissionKeysQueryOptions,
} from '~/lib/query/staff-tenant-roles';
import { staffTenantUsersQueryOptions } from '~/lib/query/staff-tenant-users';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

// Members shown in the Overview avatar stack / preview before "View all".
// It uses the same canonical offset-paginated endpoint as the full Members tab.
const MEMBERS_PREVIEW_LIMIT = 5;

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

/** The full Members tab and the Members page share one list default. */
export const ROLE_MEMBERS_DEFAULT_SORT = {
	id: 'created_at',
	order: 'desc' as const,
};
export const ROLE_MEMBERS_DEFAULT_SIZE = 20;

/** The assign drawer's candidate list (tenant users), first page. */
export const ASSIGN_CANDIDATES_DEFAULT_SORT = {
	id: 'created_at',
	order: 'desc' as const,
};
export const ASSIGN_CANDIDATES_DEFAULT_SIZE = 20;

/** The assign drawer's candidate list for `search`; the cursor stays with the
 * drawer (React state), the loader warms the first page. */
export const assignCandidatesQuery = (
	tenantId: string,
	search: TableSearchParams = {},
) => {
	const { q, sortId, sortOrder, size } = buildTableApiVariables(
		search,
		ASSIGN_CANDIDATES_DEFAULT_SORT,
		ASSIGN_CANDIDATES_DEFAULT_SIZE,
	);

	return {
		options: staffTenantUsersQueryOptions,
		variables: { tenantId, q, sortId, sortOrder, size },
	};
};

const roleMembersListQuery = ({
	tenantId,
	roleId,
	search,
}: {
	tenantId: string;
	roleId: string;
	search: TableSearchParams;
}) => {
	const { q, sortId, sortOrder, size } = buildTableApiVariables(
		search,
		ROLE_MEMBERS_DEFAULT_SORT,
		ROLE_MEMBERS_DEFAULT_SIZE,
	);

	return {
		options: staffTenantRoleMembersQueryOptions,
		// The page index lives in React state: the loader warms page 0.
		variables: { tenantId, roleId, q, sortId, sortOrder, pageIndex: 0, size },
	};
};

/**
 * The Members section's query (`roles/$roleId/members`): the tab keeps its
 * search in React state, so a fresh mount reads the default list. The
 * layout's `roleDetailsQueries` loader warms the rest. The assign drawer is
 * closed until the user opens it, so its candidate list is not warmed.
 */
export const roleMembersQueries = ({
	tenantId,
	roleId,
	search = {},
}: {
	tenantId: string;
	roleId: string;
	search?: TableSearchParams;
}) => ({
	roleMembers: roleMembersListQuery({ tenantId, roleId, search }),
});

/**
 * The Members page's queries (`roles/$roleId/users`): the list follows the
 * URL search. The assign drawer opens from `?assign=1`, and only then reads
 * its candidate list (the assignment resolution is exempt, see the hook).
 */
export const roleUsersQueries = ({
	tenantId,
	roleId,
	search,
}: {
	tenantId: string;
	roleId: string;
	search: TableSearchParams & { assign?: 1 };
}) => {
	const tenantDetails = {
		options: staffTenantDetailsQueryOptions,
		variables: { tenantId },
	};
	const roleDetails = {
		options: staffTenantRoleDetailsQueryOptions,
		variables: { tenantId, roleId },
	};
	const roleMembers = roleMembersListQuery({ tenantId, roleId, search });
	const tenantUsers = assignCandidatesQuery(tenantId);

	const spec: Record<string, RouteQuerySpecEntry> =
		search.assign === 1
			? { tenantDetails, roleDetails, roleMembers, tenantUsers }
			: { tenantDetails, roleDetails, roleMembers };

	return { tenantDetails, roleDetails, roleMembers, spec };
};
