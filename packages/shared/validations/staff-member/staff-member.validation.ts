import { ACCOUNT_LEVEL_ENUM } from '@/shared/lib/constants';
import type InterZod from '@/shared/lib/zod/InterZod';

export const getNewStaffMemberSchemaServerSide = (z: InterZod) => {
	return z.object({
		firstName: z.string().optional(),
		lastName: z.string().min(1),
		email: z.string().email(),
		accountLevel: z.enum([
			ACCOUNT_LEVEL_ENUM.ADMIN,
			ACCOUNT_LEVEL_ENUM.USER,
		] as const),
	});
};
