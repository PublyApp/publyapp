import type { QueryClient } from '@tanstack/react-query';

import {
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
	]);
};
