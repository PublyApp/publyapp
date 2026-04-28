import {
	createUntypedArray,
	createUntypedNull,
	createUntypedNumber,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import isNil from 'lodash/isNil';

import type {
	CreateTenantAsStaffBody,
	CreateTenantAsStaffResult,
	CreateTenantProfileAsStaffBody,
	GetTenantProfileByIdResponse,
	SuspendTenantAsStaffBody,
	UpdateTenantAsStaffBody,
	UpdateTenantProfileAsStaffBody,
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

		if (isNil(result)) {
			throw new Error('useCreateTenant: result is nil');
		}
		return result;
	},
});

export const useGetTenant = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.byTenantId('').get,
	fetcher: async (client, params: { tenantId: string }) => {
		const result = await client.staff.tenants.byTenantId(params.tenantId).get();

		if (isNil(result)) {
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

		if (isNil(result)) {
			throw new Error('useFindTenants: result is nil');
		}

		return result;
	},
});

type FindTenantProfilesParams = {
	tenantId: string;
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	q?: string;
};

export const useFindTenantProfiles = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.byTenantId('').profiles.get,
	fetcher: async (client, params: FindTenantProfilesParams) => {
		const result = await client.staff.tenants
			.byTenantId(params.tenantId)
			.profiles.get({
				queryParameters: {
					cursor: params.cursor,
					limit: params.limit ? params.limit.toString() : undefined,
					sortId: params.sort?.id,
					sortOrder: params.sort?.order,
					q: params.q,
				},
			});

		if (isNil(result)) {
			throw new Error('useFindTenantProfiles: result is nil');
		}

		return result;
	},
});

type FindTenantPermissionsParams = {
	language?: string;
};

export const useFindTenantPermissions = createStaffQuery({
	queryKeyFn: (client) => client.staff.permissions.scopes.tenant.get,
	fetcher: async (client, params: FindTenantPermissionsParams) => {
		// The backend owns the tenant permission catalog now, including translated labels.
		const result = await client.staff.permissions.scopes.tenant.get({
			queryParameters: {
				language: params.language,
			},
		});

		if (isNil(result)) {
			throw new Error('useFindTenantPermissions: result is nil');
		}

		return result;
	},
});

type GetTenantProfileByIdParams = {
	tenantId: string;
	profileId: string;
};

export const useGetTenantProfileById = createStaffQuery({
	queryKeyFn: (client) =>
		client.staff.tenants.byTenantId('').profiles.byProfileId('').get,
	fetcher: async (client, params: GetTenantProfileByIdParams) => {
		const result: GetTenantProfileByIdResponse | undefined =
			await client.staff.tenants
				.byTenantId(params.tenantId)
				.profiles.byProfileId(params.profileId)
				.get();

		if (isNil(result)) {
			throw new Error('useGetTenantProfileById: result is nil');
		}

		if (isNil(result.profile)) {
			throw new Error('useGetTenantProfileById: profile is nil');
		}

		return result;
	},
});

type CreateTenantProfilePayload = {
	tenantId: string;
	name: string;
	description?: string | null;
	permissionKeys: string[];
};

export const useCreateTenantProfile = createStaffMutation({
	mutationKeyFn: (client) => client.staff.tenants.byTenantId('').profiles.post,
	mutationFn: async (client, payload: CreateTenantProfilePayload) => {
		const body: CreateTenantProfileAsStaffBody = {};

		body.name = createUntypedString(payload.name) as typeof body.name;

		if (payload.description !== undefined) {
			body.description =
				payload.description === null
					? (createUntypedNull() as typeof body.description)
					: (createUntypedString(
							payload.description,
						) as typeof body.description);
		}

		body.permissionKeys = createUntypedArray(
			payload.permissionKeys.map((permissionKey) => {
				return createUntypedString(permissionKey);
			}),
		) as typeof body.permissionKeys;

		const result: GetTenantProfileByIdResponse | undefined =
			await client.staff.tenants
				.byTenantId(payload.tenantId)
				.profiles.post(body);

		if (isNil(result)) {
			throw new Error('useCreateTenantProfile: result is nil');
		}

		if (isNil(result.profile)) {
			throw new Error('useCreateTenantProfile: profile is nil');
		}

		return result;
	},
});

type UpdateTenantProfilePayload = {
	tenantId: string;
	profileId: string;
	name?: string;
	description?: string | null;
};

export const useUpdateTenantProfile = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').profiles.byProfileId('').patch,
	mutationFn: async (client, payload: UpdateTenantProfilePayload) => {
		const body: UpdateTenantProfileAsStaffBody = {};

		if (payload.name !== undefined) {
			body.name = createUntypedString(payload.name) as typeof body.name;
		}

		if (payload.description !== undefined) {
			body.description =
				payload.description === null
					? (createUntypedNull() as typeof body.description)
					: (createUntypedString(
							payload.description,
						) as typeof body.description);
		}

		const result: GetTenantProfileByIdResponse | undefined =
			await client.staff.tenants
				.byTenantId(payload.tenantId)
				.profiles.byProfileId(payload.profileId)
				.patch(body);

		if (isNil(result)) {
			throw new Error('useUpdateTenantProfile: result is nil');
		}

		if (isNil(result.profile)) {
			throw new Error('useUpdateTenantProfile: profile is nil');
		}

		return result;
	},
});

type DeleteTenantProfilePayload = {
	tenantId: string;
	profileId: string;
};

export const useDeleteTenantProfile = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').profiles.byProfileId('').delete,
	mutationFn: async (client, payload: DeleteTenantProfilePayload) => {
		const result = await client.staff.tenants
			.byTenantId(payload.tenantId)
			.profiles.byProfileId(payload.profileId)
			.delete();

		if (isNil(result)) {
			throw new Error('useDeleteTenantProfile: result is nil');
		}

		return result;
	},
});

type FindTenantProfilePermissionsParams = {
	tenantId: string;
	profileId: string;
};

export const useFindTenantProfilePermissions = createStaffQuery({
	queryKeyFn: (client) =>
		client.staff.tenants.byTenantId('').profiles.byProfileId('').permissions
			.get,
	fetcher: async (client, params: FindTenantProfilePermissionsParams) => {
		const result = await client.staff.tenants
			.byTenantId(params.tenantId)
			.profiles.byProfileId(params.profileId)
			.permissions.get();

		if (isNil(result)) {
			throw new Error('useFindTenantProfilePermissions: result is nil');
		}

		if (isNil(result.permissionKeys)) {
			throw new Error('useFindTenantProfilePermissions: permissionKeys is nil');
		}

		return result;
	},
});

type AssignTenantProfilePermissionPayload = {
	tenantId: string;
	profileId: string;
	permissionKey: string;
};

export const useAssignTenantProfilePermission = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants
			.byTenantId('')
			.profiles.byProfileId('')
			.permissions.byPermissionKey('').post,
	mutationFn: async (client, payload: AssignTenantProfilePermissionPayload) => {
		await client.staff.tenants
			.byTenantId(payload.tenantId)
			.profiles.byProfileId(payload.profileId)
			.permissions.byPermissionKey(payload.permissionKey)
			.post();
	},
});

type UnassignTenantProfilePermissionPayload = {
	tenantId: string;
	profileId: string;
	permissionKey: string;
};

export const useUnassignTenantProfilePermission = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants
			.byTenantId('')
			.profiles.byProfileId('')
			.permissions.byPermissionKey('').delete,
	mutationFn: async (
		client,
		payload: UnassignTenantProfilePermissionPayload,
	) => {
		await client.staff.tenants
			.byTenantId(payload.tenantId)
			.profiles.byProfileId(payload.profileId)
			.permissions.byPermissionKey(payload.permissionKey)
			.delete();
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
		if (isNil(result)) {
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
		if (isNil(result)) {
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

		if (isNil(result)) {
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

		if (isNil(result)) {
			throw new Error('useFindTenantInvitations: result is nil');
		}

		return result;
	},
});

type RevokeTenantInvitationPayload = {
	tenantId: string;
	invitationId: string;
};

export const useRevokeTenantInvitation = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').invitations.byInvitationId('').delete,
	mutationFn: async (client, variables: RevokeTenantInvitationPayload) => {
		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.invitations.byInvitationId(variables.invitationId)
			.delete();

		if (isNil(result)) {
			throw new Error('useRevokeTenantInvitation: result is nil');
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

		if (isNil(result)) {
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

		if (isNil(result)) {
			throw new Error('useRemoveTenantUser: result is nil');
		}
		return result;
	},
});

export const useSuspendTenantUser = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').users.byUserId('').suspend.post,
	mutationFn: async (
		client,
		variables: { tenantId: string; userId: string },
	) => {
		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.users.byUserId(variables.userId)
			.suspend.post();

		if (isNil(result)) {
			throw new Error('useSuspendTenantUser: result is nil');
		}
		return result;
	},
});

export const useReactivateTenantUser = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.tenants.byTenantId('').users.byUserId('').reactivate.post,
	mutationFn: async (
		client,
		variables: { tenantId: string; userId: string },
	) => {
		const result = await client.staff.tenants
			.byTenantId(variables.tenantId)
			.users.byUserId(variables.userId)
			.reactivate.post();

		if (isNil(result)) {
			throw new Error('useReactivateTenantUser: result is nil');
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

		if (isNil(result)) {
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
		if (isNil(result)) {
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
		if (isNil(result)) {
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
		if (isNil(result)) {
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
		if (isNil(result)) {
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
		if (isNil(result)) {
			throw new Error('useBulkDeleteTenants: result is nil');
		}
		return result;
	},
});
