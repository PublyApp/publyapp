import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import type { AccountLevel } from '@/shared/lib/constants';
import { getQueryKey } from '../../query-utils';

const createStaffMemberMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.staffMembers.post,
);

export const useCreateStaffMember = createMutation({
	mutationKey: [createStaffMemberMutationKey] as const,
	mutationFn: async (data: {
		email: string;
		firstName?: string;
		lastName?: string;
		avatarUrl?: string;
		accountLevel: AccountLevel;
	}) => {
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
