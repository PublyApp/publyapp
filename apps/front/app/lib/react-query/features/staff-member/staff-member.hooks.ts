import { functionName } from '@/shared/lib/constants';
import { defaultApiClient } from 'packages/api/ApiClient';
import type { CreateStaffMemberParams } from 'packages/api/features/staff-member/staff-member.endpoint';
import { createMutation } from 'react-query-kit';

export const useCreateStaffMember = createMutation({
	mutationKey: [functionName.staff.staffMember.create] as const,
	mutationFn: async (data: CreateStaffMemberParams) => {
		return defaultApiClient.staffMember.createStaffMember(data);
	},
});
