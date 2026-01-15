import {
	createUntypedBoolean,
	createUntypedString,
	type UntypedNode,
} from '@microsoft/kiota-abstractions';
import _ from 'lodash';

import type {
	CreateStaffUserBody,
	UpdateStaffUserBody,
} from '@/js-client/src/models';
import type { AccountLevel, UserStatus } from '@/shared/lib/constants';

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
		_.forEach(data, (value, key) => {
			if (value !== undefined) {
				// Use type assertion since generated types don't include UntypedNode in unions
				(body as Record<string, unknown>)[key] = createUntypedValue(value);
			}
		});
		const result = await client.staff.users.post(body);
		if (_.isNil(result)) {
			throw new Error('useCreateStaffUser: result is nil');
		}
		return result;
	},
});

type FindStaffMembersQuery = {
	limit?: number;
	page?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

export const useFindStaffMember = createStaffQuery({
	queryKeyFn: (client) => client.staff.users.get,
	fetcher: async (client, params: FindStaffMembersQuery) => {
		const result = await client.staff.users.get({
			queryParameters: {
				page: params.page ? params.page.toString() : undefined,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});
		if (_.isNil(result)) {
			throw new Error('useFindStaffMember: result is nil');
		}
		return result;
	},
});

export const useGetStaffMemberById = createStaffQuery({
	queryKeyFn: (client) => client.staff.users.byUserId('').get,
	fetcher: async (client, params: { userId: string }) => {
		const result = await client.staff.users.byUserId(params.userId).get();
		if (_.isNil(result)) {
			throw new Error('useGetStaffMemberById: result is nil');
		}
		return result;
	},
});

type UpdateStaffMemberPayload = {
	id: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	avatarUrl?: string;
	accountLevel?: AccountLevel;
	status?: UserStatus;
};

export const useUpdateStaffMember = createStaffMutation({
	mutationKeyFn: (client) => client.staff.users.byUserId('').patch,
	mutationFn: async (client, data: UpdateStaffMemberPayload) => {
		const body: UpdateStaffUserBody = {};
		_.forEach(data, (value, key) => {
			if (key === 'id' || value === undefined) {
				return;
			}
			// Use type assertion since generated types don't include UntypedNode in unions
			(body as Record<string, unknown>)[key] = createUntypedValue(value);
		});
		const result = await client.staff.users.byUserId(data.id).patch(body);
		if (_.isNil(result)) {
			throw new Error('useUpdateStaffMember: result is nil');
		}
		return result;
	},
});
