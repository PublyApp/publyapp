import { roleNames } from '@/shared/lib/constants';
import type InterZod from '@/shared/lib/zod/InterZod';

export const getNewStaffMemberSchemaServerSide = (z: InterZod) => {
	return z.object({
		firstName: z.string().optional(),
		lastName: z.string().min(1),
		email: z.string().email(),
		role: z.enum(roleNames),
	});
};
