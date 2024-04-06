import type zod from 'zod';

import type CustomZod from '@/shared/lib/zod/CustomZod';

import { getFileSchemaClientSide } from '../file/file.validations.client';

import { getCreatePostInputSchema, getUpdatePostInputSchema } from './post.validations';

export const getUpdatePostSchemaClientSide = (z: CustomZod) => {
	return getUpdatePostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export const getCreatePostInputSchemaClientSide = (z: CustomZod) => {
	return getCreatePostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export type UpdatePostSchemaClientSide = zod.infer<ReturnType<typeof getUpdatePostSchemaClientSide>>;
export type CreatePostSchemaClientSide = zod.infer<ReturnType<typeof getCreatePostInputSchemaClientSide>>;
