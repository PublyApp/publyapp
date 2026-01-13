import { createUntypedString } from '@microsoft/kiota-abstractions';
import _ from 'lodash';

import type { CreateTenantAsStaffBody } from '@/js-client/src/models';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

export const useCreateTenant = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.post,
	mutationFn: async (client, params: { name: string }) => {
		const body: CreateTenantAsStaffBody = {
			name: createUntypedString(params.name) as typeof body.name,
		};
		return client.staff.tenants.post(body);
	},
});

export const useGetTenant = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.byTenantId('').get,
	fetcher: async (client, params: { tenantId: string }) => {
		const result = await client.staff.tenants.byTenantId(params.tenantId).get();

		if (_.isNil(result)) {
			throw new Error('useGetTenant: result is nil');
		}

		return result;
	},
});

type FindTenantsParams = {
	page?: number;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

export const useFindTenants = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.get,
	fetcher: async (client, params: FindTenantsParams) => {
		const result = await client.staff.tenants.get({
			queryParameters: {
				page: params.page ? params.page.toString() : undefined,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});

		if (_.isNil(result)) {
			throw new Error('useFindTenants: result is nil');
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

export const useFindTenantProfiles = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.tenant.byTenantId('').get,
	fetcher: async (client, params: FindTenantProfilesParams) => {
		const result = await client.staff.profiles.tenant
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
			throw new Error('useFindTenantProfiles: result is nil');
		}

		return result;
	},
});
