import type zod from 'zod';

import type CustomZod from '@/shared/lib/zod/CustomZod';

import { getFileSchemaClientSide } from '../file/file.validations.client';

import { getCreatePostInputSchema, getUpdatePostInputSchema } from './blogPost.validations';

export const getUpdatePostInputSchemaClientSide = (z: CustomZod) => {
	return getUpdatePostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export const getCreatePostInputSchemaClientSide = (z: CustomZod) => {
	return getCreatePostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export type UpdatePostInputClientSide = zod.infer<ReturnType<typeof getUpdatePostInputSchemaClientSide>>;
export type CreatePostInputClientSide = zod.infer<ReturnType<typeof getCreatePostInputSchemaClientSide>>;
