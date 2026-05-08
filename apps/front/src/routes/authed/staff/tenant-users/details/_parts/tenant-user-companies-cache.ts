import type { QueryClient } from '@tanstack/react-query';

import {
	useFindTenants,
	useFindTenantUserCompanies,
	useFindTenantUsers,
	useGetTenantUserById,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

type InvalidateTenantUserCompanyQueriesArgs = {
	queryClient: QueryClient;
	userId: string;
};

export const invalidateTenantUserCompanyQueries = async ({
	queryClient,
	userId,
}: InvalidateTenantUserCompanyQueriesArgs) => {
	// Membership mutations affect the identity company count, this table's
	// cursor pages, tenant detail user tables, and tenant list counters.
	await Promise.all([
		queryClient.invalidateQueries({
			queryKey: useGetTenantUserById.getKey({ userId }),
		}),
		queryClient.invalidateQueries({
			queryKey: useFindTenantUserCompanies.getKey(),
		}),
		queryClient.invalidateQueries({
			queryKey: useFindTenantUsers.getKey(),
		}),
		queryClient.invalidateQueries({
			queryKey: useFindTenants.getKey(),
		}),
	]);
};
