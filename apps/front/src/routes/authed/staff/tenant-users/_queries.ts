import { globalTenantUserDetailsQueryOptions } from '~/lib/query/staff-global-tenant-users';

/** The details shell's query, shared by both tabs: the loader warms it and the
 * shell reads the same variables. */
export const globalTenantUserQueries = ({ userId }: { userId: string }) => ({
	details: {
		options: globalTenantUserDetailsQueryOptions,
		variables: { userId },
	},
});
