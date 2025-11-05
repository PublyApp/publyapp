import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import { getQueryKey } from '../../query-utils';

const createTenantMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.tenants.post,
);

export const useCreateTenant = createMutation({
	mutationKey: [createTenantMutationKey] as const,
	mutationFn: async (params: { name: string }) => {
		return clientManager.apiClient.staff.tenants.post({
			name: {
				getValue() {
					return params.name;
				},
			},
		});
	},
});

const getTenantQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.tenants.byTenantId('').get,
);

export const useGetTenant = createQuery({
	queryKey: [getTenantQueryKey] as const,
	fetcher: async (params: { tenantId: string }) => {
		const result = await clientManager.apiClient.staff.tenants
			.byTenantId(params.tenantId)
			.get();

		if (_.isNil(result)) {
			throw new Error(`[${getTenantQueryKey}]: result is nil`);
		}

		return result;
	},
});

type FindTenantsParams = {
	page?: number;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

const findTenantsQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.tenants.get,
);

export const useFindTenants = createQuery({
	queryKey: [findTenantsQueryKey] as const,
	fetcher: async (params: FindTenantsParams) => {
		const result = await clientManager.apiClient.staff.tenants.get({
			queryParameters: {
				page: params.page ? params.page.toString() : undefined,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});

		if (_.isNil(result)) {
			throw new Error(`[${findTenantsQueryKey}] result is nil`);
		}

		return result;
	},
});

type FindTenantProfilesParams = {
	tenantId: string;
	page?: number;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

const findTenantProfilesQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.profiles.tenant.byTenantId('').get,
);

export const useFindTenantProfiles = createQuery({
	queryKey: [findTenantProfilesQueryKey] as const,
	fetcher: async (params: FindTenantProfilesParams) => {
		const result = await clientManager.apiClient.staff.profiles.tenant
			.byTenantId(params.tenantId)
			.get({
				queryParameters: {
					page: params.page ? params.page.toString() : undefined,
					limit: params.limit ? params.limit.toString() : undefined,
					sortId: params.sort?.id,
					sortOrder: params.sort?.order,
				},
			});

		if (_.isNil(result)) {
			throw new Error(`[${findTenantProfilesQueryKey}] result is nil`);
		}

		return result;
	},
});
