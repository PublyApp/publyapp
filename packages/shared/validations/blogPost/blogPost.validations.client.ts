import type zod from 'zod';

import type CustomZod from '@/shared/lib/zod/CustomZod';

import { getFileSchemaClientSide } from '../file/file.validations.client';

import { getCreateBlogPostInputSchema, getUpdateBlogPostInputSchema } from './blogPost.validations';

export const getUpdateBlogPostInputSchemaClientSide = (z: CustomZod) => {
	return getUpdateBlogPostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export const getCreateBlogPostInputSchemaClientSide = (z: CustomZod) => {
	return getCreateBlogPostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export type UpdateBlogPostInputClientSide = zod.infer<ReturnType<typeof getUpdateBlogPostInputSchemaClientSide>>;
export type CreateBlogPostInputClientSide = zod.infer<ReturnType<typeof getCreateBlogPostInputSchemaClientSide>>;
