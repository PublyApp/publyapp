import type InterZod from '@/shared/lib/zod/InterZod';
import { getFileSchemaClientSide } from '../file/file-client.validations';
import { getEmailFieldSchema } from '../auth.validations';

export const getNewStaffMemberSchemaClientSide = (z: InterZod) => {
	// const t = z.t;

	return z.object({
		avatar: getFileSchemaClientSide(z).optional(),
		firstName: z.string().optional(),
		lastName: z.string().min(1),
		email: getEmailFieldSchema(z),
		role: z.string().min(1),
	});
};
