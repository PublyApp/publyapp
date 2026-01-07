import {
	createUntypedBoolean,
	createUntypedString,
	type UntypedNode,
} from '@microsoft/kiota-abstractions';
import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import type {
	CreateStaffMemberBody,
	UpdateStaffMemberBody,
} from '@/js-client/src/models';
import type { AccountLevel, UserStatus } from '@/shared/lib/constants';
import { getQueryKey } from '../../query-utils';

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

const createStaffMemberMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.staffMembers.post,
);

type CreateStaffMemberPayload = {
	email: string;
	firstName?: string;
	lastName?: string;
	avatarUrl?: string;
	sendNotification?: boolean;
	accountLevel?: AccountLevel;
};

export const useCreateStaffMember = createMutation({
	mutationKey: [createStaffMemberMutationKey] as const,
	mutationFn: async (data: CreateStaffMemberPayload) => {
		const body: CreateStaffMemberBody = {};
		_.forEach(data, (value, key) => {
			if (value !== undefined) {
				// Use type assertion since generated types don't include UntypedNode in unions
				(body as Record<string, unknown>)[key] = createUntypedValue(value);
			}
		});
		const result = await clientManager.apiClient.staff.staffMembers.post(body);
		if (_.isNil(result)) {
			throw new Error(`[${createStaffMemberMutationKey}]: result is nil`);
		}
		return result;
	},
});

const findStaffMemberQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.staffMembers.get,
);

type FindStaffMembersQuery = {
	limit?: number;
	page?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

export const useFindStaffMember = createQuery({
	queryKey: [findStaffMemberQueryKey] as const,
	fetcher: async (params: FindStaffMembersQuery) => {
		const result = await clientManager.apiClient.staff.staffMembers.get({
			queryParameters: {
				page: params.page ? params.page.toString() : undefined,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});
		if (_.isNil(result)) {
			throw new Error(`[${findStaffMemberQueryKey}] result is nil`);
		}
		return result;
	},
});

const getStaffMemberByIdQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.staffMembers.byUserId('').get,
);

export const useGetStaffMemberById = createQuery({
	queryKey: [getStaffMemberByIdQueryKey] as const,
	fetcher: async (params: { userId: string }) => {
		const result = await clientManager.apiClient.staff.staffMembers
			.byUserId(params.userId)
			.get();
		if (_.isNil(result)) {
			throw new Error(`[${getStaffMemberByIdQueryKey}]: result is nil`);
		}
		return result;
	},
});

const updateStaffMemberMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.staffMembers.byUserId('').patch,
);

type UpdateStaffMemberPayload = {
	id: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	avatarUrl?: string;
	accountLevel?: AccountLevel;
	status?: UserStatus;
};

export const useUpdateStaffMember = createMutation({
	mutationKey: [updateStaffMemberMutationKey] as const,
	mutationFn: async (data: UpdateStaffMemberPayload) => {
		const body: UpdateStaffMemberBody = {};
		_.forEach(data, (value, key) => {
			if (key === 'id' || value === undefined) {
				return;
			}
			// Use type assertion since generated types don't include UntypedNode in unions
			(body as Record<string, unknown>)[key] = createUntypedValue(value);
		});
		const result = await clientManager.apiClient.staff.staffMembers
			.byUserId(data.id)
			.patch(body);
		if (_.isNil(result)) {
			throw new Error(`[${updateStaffMemberMutationKey}]: result is nil`);
		}
		return result;
	},
});
