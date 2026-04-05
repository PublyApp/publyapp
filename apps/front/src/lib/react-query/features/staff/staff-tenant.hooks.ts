import {
	createUntypedArray,
	createUntypedNull,
	createUntypedNumber,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import _ from 'lodash';

import type {
	CreateTenantAsStaffBody,
	CreateTenantAsStaffResult,
	SuspendTenantAsStaffBody,
	UpdateTenantAsStaffBody,
	UpdateTenantUserAsStaffBody,
} from '@org/client-ts/src/models';
import { SESSION_TOKEN_HEADER_KEY } from '@org/shared-ts/lib/constants';

import { getSessionTokensFromClient } from '#app/lib/cookies/session-cookie.utils.ts';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

export const useCreateTenant = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.post,
	mutationFn: async (
		client,
		params: {
			name: string;
			maxUsers: number;
			initialUsers: Array<{
				email: string;
				accountLevel: 'Admin' | 'User';
			}>;
		},
	) => {
		const reqInfo = client.staff.tenants.toPostRequestInformation(
			{} as CreateTenantAsStaffBody,
		);
		const tokens = getSessionTokensFromClient();
		const sessionToken = tokens.staffToken ?? tokens.tenantToken;

		const response = await fetch(reqInfo.URL, {
			method: reqInfo.httpMethod,
			body: JSON.stringify({
				name: params.name,
				maxUsers: params.maxUsers,
				initialUsers: params.initialUsers,
			}),
			headers: {
				'Content-Type': 'application/json',
				[SESSION_TOKEN_HEADER_KEY]: sessionToken || '',
			},
		});

		if (!response.ok) {
			const errorBody = await response.json();
			throw { ...errorBody, responseStatusCode: response.status };
		}

		const result: CreateTenantAsStaffResult | undefined = await response.json();

		if (_.isNil(result)) {
			throw new Error('useCreateTenant: result is nil');
		}
		return result;
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
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'asc' | 'desc' };
	q?: string;
	status?: string; // csv: active,pending,suspended
};

export const useFindTenants = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.get,
	fetcher: async (client, params: FindTenantsParams) => {
		const result = await client.staff.tenants.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
				q: params.q,
				status: params.status,
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
	q?: string;
	status?: string;
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
					q: params.q,
					status: params.status,
				},
			});

		if (_.isNil(result)) {
			throw new Error('useFindTenantUsers: result is nil');
		}

		return result;
	},
});

type FindTenantInvitationsParams = {
	tenantId: string;
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	status?: string;
	q?: string;
};

export const useFindTenantInvitations = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.byTenantId('').invitations.get,
	fetcher: async (client, params: FindTenantInvitationsParams) => {
		const result = await client.staff.tenants
			.byTenantId(params.tenantId)
			.invitations.get({
				queryParameters: {
					cursor: params.cursor,
					limit: params.limit ? params.limit.toString() : undefined,
					sortId: params.sort?.id,
					sortOrder: params.sort?.order,
					status: params.status,
					q: params.q,
				},
			});

		if (_.isNil(result)) {
			throw new Error('useFindTenantInvitations: result is nil');
		}

		return result;
	},
});

export const useInviteTenantUser = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').users.invitations.post,
	mutationFn: async (
		client,
		variables: {
			tenantId: string;
			email: string;
			accountLevel: 'Admin' | 'User';
		},
	) => {
		const body = {
			email: createUntypedString(variables.email),
			accountLevel: createUntypedString(variables.accountLevel),
		};

		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.users.invitations.post(body as never);

		if (_.isNil(result)) {
			throw new Error('useInviteTenantUser: result is nil');
		}
		return result;
	},
});

export const useRemoveTenantUser = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').users.byUserId('').delete,
	mutationFn: async (
		client,
		variables: { tenantId: string; userId: string },
	) => {
		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.users.byUserId(variables.userId)
			.delete();

		if (_.isNil(result)) {
			throw new Error('useRemoveTenantUser: result is nil');
		}
		return result;
	},
});

export const useUpdateTenantUser = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').users.byUserId('').patch,
	mutationFn: async (
		client,
		variables: {
			tenantId: string;
			userId: string;
			firstName?: string | null;
			lastName?: string | null;
			avatarUrl?: string | null;
			level?: 'Admin' | 'User';
		},
	) => {
		const body: UpdateTenantUserAsStaffBody = {};
		if (variables.firstName !== undefined) {
			body.firstName = (
				variables.firstName === null
					? createUntypedNull()
					: createUntypedString(variables.firstName)
			) as typeof body.firstName;
		}
		if (variables.lastName !== undefined) {
			body.lastName = (
				variables.lastName === null
					? createUntypedNull()
					: createUntypedString(variables.lastName)
			) as typeof body.lastName;
		}
		if (variables.avatarUrl !== undefined) {
			body.avatarUrl = (
				variables.avatarUrl === null
					? createUntypedNull()
					: createUntypedString(variables.avatarUrl)
			) as typeof body.avatarUrl;
		}
		if (variables.level !== undefined) {
			body.level = createUntypedString(variables.level) as typeof body.level;
		}

		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.users.byUserId(variables.userId)
			.patch(body);

		if (_.isNil(result)) {
			throw new Error('useUpdateTenantUser: result is nil');
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

export const useBulkSuspendTenants = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.bulkSuspend.post,
	mutationFn: async (
		client,
		variables: { tenantIds: string[]; reason?: string },
	) => {
		const body: Record<string, unknown> = {
			tenantIds: createUntypedArray(
				variables.tenantIds.map((id) => createUntypedString(id)),
			),
		};
		if (variables.reason) {
			body.reason = createUntypedString(variables.reason);
		}
		const result = await client.staff.tenants.bulkSuspend.post(body as never);
		if (_.isNil(result)) {
			throw new Error('useBulkSuspendTenants: result is nil');
		}
		return result;
	},
});

export const useBulkReactivateTenants = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.bulkReactivate.post,
	mutationFn: async (client, variables: { tenantIds: string[] }) => {
		const body: Record<string, unknown> = {
			tenantIds: createUntypedArray(
				variables.tenantIds.map((id) => createUntypedString(id)),
			),
		};
		const result = await client.staff.tenants.bulkReactivate.post(
			body as never,
		);
		if (_.isNil(result)) {
			throw new Error('useBulkReactivateTenants: result is nil');
		}
		return result;
	},
});

export const useBulkDeleteTenants = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.bulkDelete.post,
	mutationFn: async (client, variables: { tenantIds: string[] }) => {
		const body: Record<string, unknown> = {
			tenantIds: createUntypedArray(
				variables.tenantIds.map((id) => createUntypedString(id)),
			),
		};
		const result = await client.staff.tenants.bulkDelete.post(body as never);
		if (_.isNil(result)) {
			throw new Error('useBulkDeleteTenants: result is nil');
		}
		return result;
	},
});
