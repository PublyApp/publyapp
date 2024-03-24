import type zod from 'zod';

import type CustomZod from '@/shared/lib/zod/CustomZod';

import { getFileSchemaClientSide } from '../file/file.validations.client';
import { getUpdatePostInputSchema } from '../post.validations';

// export const getUpdatePostInputSchemaClientSide = (z: CustomZod) => {
// 	const ID = 'ObjectId';
// 	// const PUBLISHED = z.t('common:published');

// 	return getCreatePostInputSchema(z)
// 		.partial()
// 		.extend({
// 			objectId: z.string().min(1, { message: z.t('common:form.error.required', { field: ID }) }),
// 			published: z.boolean().optional(),
// 			coverFile: getFileSchemaClientSide(z).optional(),
// 		});
// };

export const getUpdatePostSchemaClientSide = (z: CustomZod) => {
	return getUpdatePostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export type UpdatePostSchemaClientSide = zod.infer<ReturnType<typeof getUpdatePostSchemaClientSide>>;
