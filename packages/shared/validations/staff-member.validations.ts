import { ACCOUNT_LEVEL_ENUM, USER_STATUS_ENUM } from '@/shared/lib/constants';
import type InterZod from '@/shared/lib/zod/InterZod';
import { getFileSchemaClientSide } from './file/file-client.validations';

export const getNewStaffMemberSchema = (z: InterZod) => {
	return z.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1),
		email: z.string().email(),
		accountLevel: z.enum([
			ACCOUNT_LEVEL_ENUM.ADMIN,
			ACCOUNT_LEVEL_ENUM.USER,
		] as const),
		sendNotification: z.boolean().optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};

export const getUpdateStaffMemberSchema = (z: InterZod) => {
	return getNewStaffMemberSchema(z)
		.omit({ sendNotification: true })
		.partial()
		.extend({
			id: z.string(),
			status: z
				.enum([
					USER_STATUS_ENUM.ACTIVE,
					USER_STATUS_ENUM.INACTIVE,
					USER_STATUS_ENUM.PENDING,
					USER_STATUS_ENUM.SUSPENDED,
					USER_STATUS_ENUM.DELETED,
					USER_STATUS_ENUM.BANNED,
				] as const)
				.optional(),
		});
};
