import { createMutation, createQuery } from 'react-query-kit';
import { defaultApiClient } from '@/parse-api-client/ApiClient';
import type { CreateStaffMemberParams } from '@/parse-api-client/features/staff-member/staff-member.endpoint';
import { functionName } from '@/shared/lib/constants';

export const useCreateStaffMember = createMutation({
	mutationKey: [functionName.staff.staffMember.create] as const,
	mutationFn: async (data: CreateStaffMemberParams) => {
		return defaultApiClient.staffMember.createStaffMember(data);
	},
});

export const useFindStaffMember = createQuery({
	queryKey: [functionName.staff.staffMember.find] as const,
	fetcher: async ({
		limit,
		page,
		sort,
	}: {
		limit?: number;
		page?: number;
		sort?: { id: string; order: 'desc' | 'asc' };
	}) => {
		return defaultApiClient.staffMember.findStaffMember({
			page,
			limit,
			sort,
		});
	},
});

export const useGetStaffMemberById = createQuery({
	queryKey: [functionName.staff.staffMember.getById] as const,
	fetcher: async ({ id }: { id: string }) => {
		return defaultApiClient.staffMember.getStaffMemberById({ id });
	},
});
