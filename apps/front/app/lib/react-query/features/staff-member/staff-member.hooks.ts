import { functionName } from '@/shared/lib/constants';
import { defaultApiClient } from 'packages/api/ApiClient';
import type { CreateStaffMemberParams } from 'packages/api/features/staff-member/staff-member.endpoint';
import { createMutation, createQuery } from 'react-query-kit';

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
