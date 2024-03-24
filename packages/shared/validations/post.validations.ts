import type zod from 'zod';

import { SLUG_REGEX } from '../lib/constants';
import type CustomZod from '../lib/zod/CustomZod';
import { getListParamsSchema } from '../utils/validation.utils';

import { getLocaleSchema } from './locale.validation';

export const getDateTypeSchema = (z: CustomZod) => {
	return z
		.date()
		.or(z.string())
		.or(z.number())
		.transform((value) => {
			return new Date(value);
		});
};

export const getCreatePostInputSchema = (z: CustomZod) => {
	const TITLE = z.t('common:title');
	const SLUG = 'Slug';
	const DESCRIPTION = 'Description';
	const CONTENT = z.t('common:content');
	// const AUTHOR_ID = 'authorId';
	const COVER = z.t('common:cover');
	// const COVER_URL = t('common:cover');
	// const DESCRIPTION = t('common:description')

	const TITLE_MAX_LENGTH = 170;
	const DESCRIPTION_MAX_LENGTH = 300;

	return z.object({
		// objectId: z.string({ errorMap: getErrorMap(t, { field: ID }) }).optional(),
		// published: z.boolean({ errorMap: getErrorMap(t, { field: PUBLISHED }) }).optional(),
		locale: getLocaleSchema(z),
		title: z
			.string()
			.min(1, { message: z.t('common:form.error.required', { field: TITLE }) })
			// .min(1)
			.max(TITLE_MAX_LENGTH, {
				message: z.t('common:form.error.maxLength', { field: TITLE, maxLength: TITLE_MAX_LENGTH }),
			}),
		slug: z
			.string()
			.min(1, { message: z.t('common:form.error.required', { field: SLUG }) })
			.regex(SLUG_REGEX, z.t('common:form.error.invalid', { field: SLUG })),
		description: z
			.string()
			.min(1, { message: z.t('common:form.error.required', { field: DESCRIPTION }) })
			.max(DESCRIPTION_MAX_LENGTH, {
				message: z.t('common:form.error.maxLength', { field: DESCRIPTION, maxLength: DESCRIPTION_MAX_LENGTH }),
			}),
		// content: getPostContentSchema(t),
		content: z.string().min(1, { message: z.t('common:form.error.required', { field: CONTENT }) }),
		authorId: z
			.string()
			// .min(1, { message: t('common:form.error.required', { field: AUTHOR_ID }) })
			.optional(),
		coverId: z
			.string()
			.min(1, { message: z.t('common:form.error.required', { field: COVER }) })
			.optional(),
		coverUrl: z
			.string()
			.min(1, { message: z.t('common:form.error.required', { field: COVER }) })
			.optional(),
		tags: z.array(z.string()).max(4).optional(),
		publishDate: getDateTypeSchema(z).optional(),
		updateDate: getDateTypeSchema(z).optional(),
	});
};

export const getUpdatePostInputSchema = (z: CustomZod) => {
	const ID = 'ObjectId';
	// const PUBLISHED = z.t('common:published');

	return getCreatePostInputSchema(z)
		.partial()
		.required({ locale: true })
		.extend({
			objectId: z.string().min(1, { message: z.t('common:form.error.required', { field: ID }) }),
			published: z.boolean().optional(),
		});
};

export const getFindPostFunctionParamsSchema = (z: CustomZod) => {
	return getListParamsSchema(z).and(
		z.discriminatedUnion('view', [
			z.object({
				view: z.literal('front-list'),
			}),
			z.object({
				view: z.literal('bo-table'),
				fromPublic: z.boolean().optional().default(false),
			}),
		]),
	);
};

export type CreatePostInput = zod.infer<ReturnType<typeof getCreatePostInputSchema>>;
export type UpdatePostInput = zod.infer<ReturnType<typeof getUpdatePostInputSchema>>;
