import { staffTenantUserDetailsQueryOptions } from '~/lib/query/staff-tenant-users';
import { staffTenantDetailsQueryOptions } from '~/lib/query/staff-tenants';

/**
 * The tenant user detail and edit pages' queries, declared once: the loaders
 * warm them and both pages read the same variables. The user query waits for
 * the tenant on the page (`enabled`), which sequences rendering only.
 */
export const tenantUserQueries = ({
	tenantId,
	userId,
}: {
	tenantId: string;
	userId: string;
}) => ({
	details: {
		options: staffTenantDetailsQueryOptions,
		variables: { tenantId },
	},
	userDetails: {
		options: staffTenantUserDetailsQueryOptions,
		variables: { tenantId, userId },
	},
});
