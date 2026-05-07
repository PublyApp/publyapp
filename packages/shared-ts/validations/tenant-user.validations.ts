import { ACCOUNT_LEVEL_ENUM } from '@org/shared-ts/lib/constants';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFileSchemaClientSide } from './file/file-client.validations';

export const getUpdateTenantUserSchema = (z: InterZod) => {
	return z.object({
		id: z.string(),
		tenantId: z.string(),
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
		level: z
			.enum([ACCOUNT_LEVEL_ENUM.ADMIN, ACCOUNT_LEVEL_ENUM.USER] as const)
			.optional(),
	});
};
