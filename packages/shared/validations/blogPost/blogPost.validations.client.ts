import type zod from 'zod';

import type InterZod from '@/shared/lib/zod/InterZod';

import { getFileSchemaClientSide } from '../file/file.validations.client';

import { getCreateBlogPostInputSchema, getUpdateBlogPostInputSchema } from './blogPost.validations';

export const getUpdateBlogPostInputSchemaClientSide = (z: InterZod) => {
	return getUpdateBlogPostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export const getCreateBlogPostInputSchemaClientSide = (z: InterZod) => {
	return getCreateBlogPostInputSchema(z).extend({
		coverFile: getFileSchemaClientSide(z).optional(),
	});
};

export type UpdateBlogPostInputClientSide = zod.infer<ReturnType<typeof getUpdateBlogPostInputSchemaClientSide>>;
export type CreateBlogPostInputClientSide = zod.infer<ReturnType<typeof getCreateBlogPostInputSchemaClientSide>>;
