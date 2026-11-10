import { staffTenantRolesQueryOptions } from '~/lib/query/staff-tenant-roles';

/*
 * Page size for the invite drawer's role picker. Server-side search +
 * cursor pagination (#821 pattern) instead of fetching the whole catalogue —
 * the previous hard-coded `size: 100` silently truncated tenants with more
 * than 100 roles.
 */
export const INVITE_ROLE_PAGE_SIZE = 20;

/** The picker's first role page; the routes that can open the invite drawer
 * warm exactly this. */
export const inviteRolesQuery = (tenantId: string) => ({
	options: staffTenantRolesQueryOptions,
	variables: {
		tenantId,
		sortId: 'name',
		sortOrder: 'asc' as const,
		size: INVITE_ROLE_PAGE_SIZE,
	},
});

/** The tenant overview's five-row users preview; the route's spec warms
 * exactly this. */
export const tenantUsersPreviewVariables = (tenantId: string) => ({
	tenantId,
	size: 5,
	sortId: 'created_at',
	sortOrder: 'desc' as const,
});
