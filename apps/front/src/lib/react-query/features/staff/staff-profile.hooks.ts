import {
	createUntypedArray,
	createUntypedNull,
	createUntypedString,
} from '@microsoft/kiota-abstractions';

import type {
	CreateStaffProfileBody,
	UpdateStaffProfileBody,
} from '@org/client-ts/src/models';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

type FindStaffProfilesParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	q?: string;
};

export const useFindStaffProfiles = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.get,
	fetcher: async (client, params: FindStaffProfilesParams) => {
		const result = await client.staff.profiles.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
				q: params.q,
			},
		});

		if (result == null) {
			throw new Error('useFindStaffProfiles: result is nil');
		}

		return result;
	},
});

// Query: Fetch available staff permissions from API
type FindStaffPermissionsParams = {
	language?: string;
};

export const useFindStaffPermissions = createStaffQuery({
	queryKeyFn: (client) => client.staff.permissions.get,
	fetcher: async (client, params: FindStaffPermissionsParams) => {
		const result = await client.staff.permissions.get({
			queryParameters: {
				language: params.language,
			},
		});
		if (result == null) {
			throw new Error('useFindStaffPermissions: result is nil');
		}
		return result;
	},
});

type GetStaffProfileByIdParams = {
	profileId: string;
};

export const useGetStaffProfileById = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.byProfileId('').get,
	fetcher: async (client, params: GetStaffProfileByIdParams) => {
		const result = await client.staff.profiles
			.byProfileId(params.profileId)
			.get();

		if (result == null) {
			throw new Error('useGetStaffProfileById: result is nil');
		}

		return result;
	},
});

type FindStaffProfileUsersParams = {
	profileId: string;
	page?: number;
	limit: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	q?: string;
};

export const useFindStaffProfileUsers = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.byProfileId('').users.get,
	fetcher: async (client, params: FindStaffProfileUsersParams) => {
		const result = await client.staff.profiles
			.byProfileId(params.profileId)
			.users.get({
				queryParameters: {
					page: params.page?.toString(),
					limit: params.limit.toString(),
					sortId: params.sort?.id,
					sortOrder: params.sort?.order,
					q: params.q,
				},
			});

		if (result == null) {
			throw new Error('useFindStaffProfileUsers: result is nil');
		}

		return result;
	},
});

type FindStaffProfilePermissionsParams = {
	profileId: string;
};

export const useFindStaffProfilePermissions = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.byProfileId('').permissions.get,
	fetcher: async (client, params: FindStaffProfilePermissionsParams) => {
		// This returns only raw permission keys; the permission catalog (localized labels)
		// is fetched separately via /staff/permissions.
		const result = await client.staff.profiles
			.byProfileId(params.profileId)
			.permissions.get();

		if (result == null) {
			throw new Error('useFindStaffProfilePermissions: result is nil');
		}

		return result;
	},
});

// Mutation: Create staff profile
type CreateStaffProfilePayload = {
	name: string;
	description?: string;
	permissions?: string[];
	emails?: string[];
};

export const useCreateStaffProfile = createStaffMutation({
	mutationKeyFn: (client) => client.staff.profiles.post,
	mutationFn: async (client, data: CreateStaffProfilePayload) => {
		const body: CreateStaffProfileBody = {};

		// Map payload to API body format using Kiota's UntypedNode factories
		// Type assertions are needed because the generated types don't include UntypedNode in the union
		if (data.name) {
			body.name = createUntypedString(data.name) as typeof body.name;
		}

		if (data.description) {
			body.description = createUntypedString(
				data.description,
			) as typeof body.description;
		}

		if (data.permissions && data.permissions.length > 0) {
			body.permissions = createUntypedArray(
				data.permissions.map((p) => createUntypedString(p)),
			) as typeof body.permissions;
		}

		if (data.emails && data.emails.length > 0) {
			body.emails = createUntypedArray(
				data.emails.map((e) => createUntypedString(e)),
			) as typeof body.emails;
		}

		const result = await client.staff.profiles.post(body);

		if (result == null) {
			throw new Error('useCreateStaffProfile: result is nil');
		}

		return result;
	},
});

type UpdateStaffProfilePayload = {
	profileId: string;
	name?: string;
	description?: string | null;
};

export const useUpdateStaffProfile = createStaffMutation({
	mutationKeyFn: (client) => client.staff.profiles.byProfileId('').patch,
	mutationFn: async (client, payload: UpdateStaffProfilePayload) => {
		// PATCH semantics:
		// - undefined => omit field (no change)
		// - null => clear (only supported for description)
		const body: UpdateStaffProfileBody = {};

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

		const result = await client.staff.profiles
			.byProfileId(payload.profileId)
			.patch(body);

		if (result == null) {
			throw new Error('useUpdateStaffProfile: result is nil');
		}

		return result;
	},
});

type SetStaffProfilePermissionPayload = {
	profileId: string;
	permissionKey: string;
	isAssigned: boolean;
};

export const useSetStaffProfilePermission = createStaffMutation({
	mutationKeyFn: (client) =>
		client.staff.profiles.byProfileId('').permissions.byPermissionKey('').post,
	mutationFn: async (client, payload: SetStaffProfilePermissionPayload) => {
		// Idempotent endpoints:
		// - POST assigns (safe to call multiple times)
		// - DELETE unassigns (safe to call multiple times)
		const request = client.staff.profiles
			.byProfileId(payload.profileId)
			.permissions.byPermissionKey(payload.permissionKey);

		if (payload.isAssigned) {
			await request.post();
			return;
		}

		await request.delete();
	},
});
