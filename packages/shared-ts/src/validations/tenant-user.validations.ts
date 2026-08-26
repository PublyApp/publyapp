import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFileSchemaClientSide } from './file/file-client.validations';

export const getUpdateTenantUserSchema = (z: InterZod) => {
	return z.object({
		id: z.string(),
		tenantId: z.string(),
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
		level: z.enum(['Admin', 'User'] as const).optional(),
	});
};

export const getUpdateTenantUserIdentitySchema = (z: InterZod) => {
	return z.object({
		id: z.string(),
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};
