import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import type { AccountLevel } from '@/shared/lib/constants';
import { getQueryKey } from '../../query-utils';

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
		const result = await clientManager.apiClient.staff.staffMembers.post({
			email: {
				getValue() {
					return data.email;
				},
			},
			firstName: {
				getValue() {
					return data.firstName;
				},
			},
			lastName: {
				getValue() {
					return data.lastName;
				},
			},
			avatarUrl: {
				getValue() {
					return data.avatarUrl;
				},
			},
			accountLevel: {
				getValue() {
					return data.accountLevel;
				},
			},
			sendNotification: {
				getValue() {
					return data.sendNotification;
				},
			},
		});
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
	userId: string;
	email: string;
	firstName?: string;
	lastName?: string;
	avatarUrl?: string;
	accountLevel?: AccountLevel;
};

export const useUpdateStaffMember = createMutation({
	mutationKey: [updateStaffMemberMutationKey] as const,
	mutationFn: async (data: UpdateStaffMemberPayload) => {
		const result = await clientManager.apiClient.staff.staffMembers
			.byUserId(data.userId)
			.patch({
				email: {
					getValue() {
						return data.email;
					},
				},
				accountLevel: {
					getValue() {
						return data.accountLevel;
					},
				},
				firstName: {
					getValue() {
						return data.firstName;
					},
				},
				lastName: {
					getValue() {
						return data.lastName;
					},
				},
				avatarUrl: {
					getValue() {
						return data.avatarUrl;
					},
				},
			});
		if (_.isNil(result)) {
			throw new Error(`[${updateStaffMemberMutationKey}]: result is nil`);
		}
		return result;
	},
});
