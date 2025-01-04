import { queryOptions, type QueryFunctionContext } from '@tanstack/react-query';
import apiClient from 'packages/api/ApiClient';

import type { GetTenantAuthDataFunction, GetUserAuthDataFunction } from '@/server/modules/common/auth/auth.functions';
import { functionName } from '@/shared/lib/constants';
import { sleep } from '@/shared/utils/any.utils';

// ---- 1 --------------------------------------------------------------------------------

export const getUserAuthDataQueryKeyBase = functionName.auth.getUserAuthData;

export type GetUserAuthDataQueryParams = GetUserAuthDataFunction.Params;

export const getUserAuthDataAction = async () => {
	try {
		const authData = await apiClient.auth.getUserAuthData();

		return authData;
	} catch (error) {
		console.error('----- getUserAuthDataAction error ----------', error);
		return Promise.reject(error);
	}
};

export const getUserAuthDataQuery = () => {
	return queryOptions({
		queryKey: [getUserAuthDataQueryKeyBase] as const,
		queryFn: getUserAuthDataAction,
	});
};

// ---- 2 --------------------------------------------------------------------------------

export const getTenantAuthDataQueryKeyBase = functionName.auth.getTenantAuthData;

export type GetTenantAuthDataQueryParams = GetTenantAuthDataFunction.Params;

export const getTenantAuthDataAction = async (
	context: QueryFunctionContext<readonly [typeof getTenantAuthDataQueryKeyBase, GetTenantAuthDataQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];

		await sleep(5000);

		const authData = await apiClient.auth.getTenantAuthData(params);

		return authData;
	} catch (error) {
		console.error('----- getTenantAuthDataAction error ----------', error);
		return Promise.reject(error);
	}
};

export const getTenantAuthDataQuery = (params: GetTenantAuthDataQueryParams) => {
	return queryOptions({
		queryKey: [getTenantAuthDataQueryKeyBase, params] as const,
		queryFn: getTenantAuthDataAction,
	});
};
