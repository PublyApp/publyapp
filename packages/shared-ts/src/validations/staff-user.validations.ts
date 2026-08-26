import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFileSchemaClientSide } from './file/file-client.validations';

export const getNewStaffUserSchema = (z: InterZod) => {
	return z.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1),
		email: z.email(),
		accountLevel: z.enum(['Admin', 'User'] as const),
		sendNotification: z.boolean().optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};

export const getUpdateStaffUserSchema = (z: InterZod) => {
	return (
		getNewStaffUserSchema(z)
			// Email updates are a high-risk identity operation and are handled by a dedicated endpoint/flow.
			// Status updates are handled by explicit "suspend/reactivate" actions.
			.omit({ sendNotification: true, email: true })
			.partial()
			.extend({
				id: z.string(),
			})
	);
};
