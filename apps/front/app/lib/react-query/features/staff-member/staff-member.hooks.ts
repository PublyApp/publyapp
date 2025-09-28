import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
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
	}) => {
		return clientManager.apiClient.staff.staffMembers.post({
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
		});
	},
});

const findStaffMemberQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.staffMembers.get,
);

export const useFindStaffMember = createQuery({
	queryKey: [findStaffMemberQueryKey] as const,
	fetcher: async (params: {
		limit?: number;
		page?: number;
		sort?: { id: string; order: 'desc' | 'asc' };
	}) => {
		const result = await clientManager.apiClient.staff.staffMembers.get({
			queryParameters: {
				limit: params.limit,
				page: params.page,
				sort: params.sort,
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
	fetcher: async ({ userId }: { userId: string }) => {
		return clientManager.apiClient.staff.staffMembers.byUserId(userId).get();
	},
});
