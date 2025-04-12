import { useSuspenseQuery } from '@tanstack/react-query';

import { useTenantParam } from '@/front/hooks/use-tenant-param';

import { getTenantAuthDataQuery, getUserAuthDataQuery } from './auth.actions';

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
