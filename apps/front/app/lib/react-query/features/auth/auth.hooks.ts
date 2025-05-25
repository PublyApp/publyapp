import { useSuspenseQuery } from '@tanstack/react-query';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { getTenantAuthDataQuery, getUserAuthDataQuery } from './auth.actions';
import { createSuspenseQuery } from 'react-query-kit';
import { defaultApiClient } from 'packages/api/ApiClient';
import { functionName } from '@/shared/lib/constants';

// ---- 1 --------------------------------------------------------------------------------

type UseGetUserAuthDataProps = {
	options?: Omit<
		ReturnType<typeof getUserAuthDataQuery>,
		'queryKey' | 'queryFn'
	>;
};

export const useGetUserAuthData = ({
	options,
}: UseGetUserAuthDataProps = {}) => {
	const query = getUserAuthDataQuery();

	const result = useSuspenseQuery({
		...query,
		...options,
	});

	return { result, key: query.queryKey };
};

// ---- 2 --------------------------------------------------------------------------------

type UseGetTenantAuthDataProps = {
	options?: Omit<
		ReturnType<typeof getTenantAuthDataQuery>,
		'queryKey' | 'queryFn'
	>;
};

export const useGetTenantAuthData = ({
	options,
}: UseGetTenantAuthDataProps = {}) => {
	const tenantId = useTenantParam();

	const query = getTenantAuthDataQuery({ tenantId });

	const result = useSuspenseQuery({
		...query,
		...options,
	});

	return { result, key: query.queryKey };
};

// ---- 3 --------------------------------------------------------------------

export const useCheckEmailVerificationToken = createSuspenseQuery({
	queryKey: [functionName.auth.checkEmailVerificationToken],
	fetcher: async ({ token }: { token: string }) => {
		return defaultApiClient.auth.checkEmailVerificationToken({ token });
	},
});
