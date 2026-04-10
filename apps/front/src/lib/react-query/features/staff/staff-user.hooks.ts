import {
	createUntypedArray,
	createUntypedBoolean,
	createUntypedString,
	type UntypedNode,
} from '@microsoft/kiota-abstractions';

// Prefer per-method lodash imports to avoid pulling the full lodash bundle.
import forEach from 'lodash/forEach';
import isNil from 'lodash/isNil';

import type {
	CreateStaffUserBody,
	GetStaffUserProfilesResult,
	UpdateStaffUserBody,
	UpdateStaffUserEmailBody,
	UpdateStaffUserProfilesBody,
	UpdateStaffUserProfilesResult,
} from '@org/client-ts/src/models';
import type { AccountLevel } from '@org/shared-ts/lib/constants';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

// Helper to create UntypedNode from various value types
const createUntypedValue = (value: unknown): UntypedNode => {
	if (typeof value === 'string') {
		return createUntypedString(value);
	}
	if (typeof value === 'boolean') {
		return createUntypedBoolean(value);
	}
	// For other types, create a simple UntypedNode
	return {
		getValue: () => value,
		value,
	} as UntypedNode;
};

type CreateStaffUserPayload = {
	email: string;
	firstName?: string;
	lastName?: string;
	avatarUrl?: string;
	sendNotification?: boolean;
	accountLevel?: AccountLevel;
};

export const useCreateStaffUser = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.post,
	mutationFn: async (client, data: CreateStaffUserPayload) => {
		const body: CreateStaffUserBody = {};
		forEach(data, (value, key) => {
			if (value !== undefined) {
				// Use type assertion since generated types don't include UntypedNode in unions
				(body as Record<string, unknown>)[key] = createUntypedValue(value);
			}
		});
		const result = await client.staff.users.post(body);
		if (isNil(result)) {
			throw new Error('useCreateStaffUser: result is nil');
		}
		return result;
	},
});

type FindStaffUsersQuery = {
	limit?: number;
	page?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

export const useFindStaffUser = createStaffQuery({
	queryKeyFn: (client) => client.staff.users.get,
	fetcher: async (client, params: FindStaffUsersQuery) => {
		const result = await client.staff.users.get({
			queryParameters: {
				page: params.page ? params.page.toString() : undefined,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});
		if (isNil(result)) {
			throw new Error('useFindStaffUser: result is nil');
		}
		return result;
	},
});

export const useGetStaffUserById = createStaffQuery({
	queryKeyFn: (client) => client.staff.users.byUserId('').get,
	fetcher: async (client, params: { userId: string }) => {
		const result = await client.staff.users.byUserId(params.userId).get();
		if (isNil(result)) {
			throw new Error('useGetStaffUserById: result is nil');
		}
		return result;
	},
});

type UpdateStaffUserPayload = {
	id: string;
	firstName?: string;
	lastName?: string;
	avatarUrl?: string;
	accountLevel?: AccountLevel;
};

export const useUpdateStaffUser = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.byUserId('').patch,
	mutationFn: async (client, data: UpdateStaffUserPayload) => {
		// This is the "general details" PATCH endpoint. It intentionally does NOT update:
		// - email (handled by dedicated /email endpoint)
		// - status (handled by explicit suspend/reactivate actions)
		const body: UpdateStaffUserBody = {};
		forEach(data, (value, key) => {
			if (key === 'id' || value === undefined) {
				return;
			}
			// Use type assertion since generated types don't include UntypedNode in unions
			(body as Record<string, unknown>)[key] = createUntypedValue(value);
		});
		const result = await client.staff.users.byUserId(data.id).patch(body);
		if (isNil(result)) {
			throw new Error('useUpdateStaffUser: result is nil');
		}
		return result;
	},
});

export const useSuspendStaffUser = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.byUserId('').suspend.post,
	mutationFn: async (client, data: { userId: string }) => {
		// Lifecycle operation: explicit endpoint, explicit permission, explicit audit.
		const result = await client.staff.users
			.byUserId(data.userId)
			.suspend.post();
		if (isNil(result)) {
			throw new Error('useSuspendStaffUser: result is nil');
		}
		return result;
	},
});

export const useReactivateStaffUser = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.byUserId('').reactivate.post,
	mutationFn: async (client, data: { userId: string }) => {
		// Lifecycle operation: explicit endpoint, explicit permission, explicit audit.
		const result = await client.staff.users
			.byUserId(data.userId)
			.reactivate.post();
		if (isNil(result)) {
			throw new Error('useReactivateStaffUser: result is nil');
		}
		return result;
	},
});

export const useUpdateStaffUserEmail = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.byUserId('').email.patch,
	mutationFn: async (client, data: { userId: string; email: string }) => {
		// High-risk identity operation: dedicated endpoint to avoid accidental email edits via PATCH.
		// Server returns RFC7807 422 validation problems (e.g. email-already-in-use) for field UX.
		const body: UpdateStaffUserEmailBody = {
			email: createUntypedString(data.email) as typeof body.email,
		};

		const result = await client.staff.users
			.byUserId(data.userId)
			.email.patch(body);
		if (isNil(result)) {
			throw new Error('useUpdateStaffUserEmail: result is nil');
		}
		return result;
	},
});

export const useGetStaffUserProfiles = createStaffQuery({
	queryKeyFn: (client) => client.staff.users.byUserId('').profiles.get,
	fetcher: async (client, params: { userId: string }) => {
		// Keep the type explicit here because Kiota returns `T | undefined` and we want a
		// consistent runtime error when the API unexpectedly returns empty responses.
		const result: GetStaffUserProfilesResult | undefined =
			await client.staff.users.byUserId(params.userId).profiles.get();
		if (isNil(result)) {
			throw new Error('useGetStaffUserProfiles: result is nil');
		}
		return result;
	},
});

type UpdateStaffUserProfilesPayload = {
	userId: string;
	profileIds: string[];
};

export const useUpdateStaffUserProfiles = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.byUserId('').profiles.put,
	mutationFn: async (client, data: UpdateStaffUserProfilesPayload) => {
		// This endpoint expects `profileIds` as a JSON array. Kiota models this as an
		// UntypedNode, so we build the array via `createUntypedArray(...)`.
		const body: UpdateStaffUserProfilesBody = {
			profileIds: createUntypedArray(
				data.profileIds.map((id) => createUntypedString(id)),
			) as typeof body.profileIds,
		};

		const result: UpdateStaffUserProfilesResult | undefined =
			await client.staff.users.byUserId(data.userId).profiles.put(body);

		if (isNil(result)) {
			throw new Error('useUpdateStaffUserProfiles: result is nil');
		}

		return result;
	},
});
