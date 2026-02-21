import {
	createUntypedNull,
	createUntypedNumber,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import _ from 'lodash';

import type {
	CreateTenantAsStaffBody,
	SuspendTenantAsStaffBody,
	UpdateTenantAsStaffBody,
} from '@/js-client/src/models';

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
	queryKeyFn: (client) => client.staff.tenants.byTenantId('').profiles.get,
	fetcher: async (client, params: FindTenantProfilesParams) => {
		const result = await client.staff.tenants
			.byTenantId(params.tenantId)
			.profiles.get({
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

export const useSuspendTenant = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.byTenantId('').suspend.post,
	mutationFn: async (
		client,
		variables: { tenantId: string; reason?: string },
	) => {
		const body: SuspendTenantAsStaffBody = {
			reason: variables.reason
				? (createUntypedString(variables.reason) as typeof body.reason)
				: undefined,
		};
		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.suspend.post(body);
		if (_.isNil(result)) {
			throw new Error('useSuspendTenant: result is nil');
		}
		return result;
	},
});

export const useReactivateTenant = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').reactivate.post,
	mutationFn: async (client, variables: { tenantId: string }) => {
		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.reactivate.post();
		if (_.isNil(result)) {
			throw new Error('useReactivateTenant: result is nil');
		}
		return result;
	},
});

type FindTenantUsersParams = {
	tenantId: string;
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

export const useFindTenantUsers = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.byTenantId('').users.get,
	fetcher: async (client, params: FindTenantUsersParams) => {
		const result = await client.staff.tenants
			.byTenantId(params.tenantId)
			.users.get({
				queryParameters: {
					cursor: params.cursor,
					limit: params.limit ? params.limit.toString() : undefined,
					sortId: params.sort?.id,
					sortOrder: params.sort?.order,
				},
			});

		if (_.isNil(result)) {
			throw new Error('useFindTenantUsers: result is nil');
		}

		return result;
	},
});

export const useUpdateTenant = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.byTenantId('').patch,
	mutationFn: async (
		client,
		variables: {
			tenantId: string;
			name?: string;
			logoUrl?: string | null;
			maxUsers?: number;
		},
	) => {
		const body: UpdateTenantAsStaffBody = {};
		if (variables.name !== undefined) {
			body.name = createUntypedString(variables.name) as typeof body.name;
		}
		if (variables.maxUsers !== undefined) {
			body.maxUsers = createUntypedNumber(
				variables.maxUsers,
			) as typeof body.maxUsers;
		}
		// logoUrl three-state: undefined → omit, string → set, null → clear
		if (variables.logoUrl !== undefined) {
			body.logoUrl = (
				variables.logoUrl === null
					? createUntypedNull()
					: createUntypedString(variables.logoUrl)
			) as typeof body.logoUrl;
		}

		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.patch(body);
		if (_.isNil(result)) {
			throw new Error('useUpdateTenant: result is nil');
		}
		return result;
	},
});

export const useDeleteTenant = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.byTenantId('').delete,
	mutationFn: async (client, variables: { tenantId: string }) => {
		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.delete();
		if (_.isNil(result)) {
			throw new Error('useDeleteTenant: result is nil');
		}
		return result;
	},
});
