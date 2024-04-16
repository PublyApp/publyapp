import { SLUG_REGEX } from '../../lib/constants';
import type CustomZod from '../../lib/zod/CustomZod';
import { getListParamsSchema } from '../../utils/validation.utils';
import { getLocaleSchema } from '../locale.validation';

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
	const TITLE = z.t('title');
	const SLUG = 'Slug';
	const DESCRIPTION = 'Description';
	const CONTENT = z.t('content');
	// const AUTHOR_ID = 'authorId';
	const COVER = z.t('cover');
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
			.min(1, { message: z.t('item-is-required', { item: TITLE }) })
			// .min(1)
			.max(TITLE_MAX_LENGTH),
		slug: z
			.string()
			.min(1, { message: z.t('item-is-required', { item: SLUG }) })
			.regex(SLUG_REGEX, z.t('item-is-invalid', { item: SLUG })),
		description: z
			.string()
			.min(1, { message: z.t('item-is-required', { item: DESCRIPTION }) })
			.max(DESCRIPTION_MAX_LENGTH),
		// content: getPostContentSchema(t),
		content: z.string().min(1, { message: z.t('item-is-required', { item: CONTENT }) }),
		authorId: z
			.string()
			// .min(1, { message: t('common:form.error.required', { field: AUTHOR_ID }) })
			.optional(),
		coverId: z
			.string()
			.min(1, { message: z.t('item-is-required', { item: COVER }) })
			.optional(),
		coverUrl: z
			.string()
			.min(1, { message: z.t('item-is-required', { item: COVER }) })
			.optional(),
		tags: z.array(z.string()).max(4).optional(),
		publishDate: getDateTypeSchema(z).optional(),
		updateDate: getDateTypeSchema(z).optional(),
	});
};

export const getUpdatePostInputSchema = (z: CustomZod) => {
	const ID = 'ObjectId';

	return getCreatePostInputSchema(z)
		.partial()
		.required({ locale: true })
		.extend({
			objectId: z.string().min(1, { message: z.t('item-is-required', { item: ID }) }),
			published: z.boolean().optional(),
		});
};

// export const findPostView = {
// 	frontList: 'front-list',
// 	boTable: 'bo-table',
// } as const;

export const getFindPostFunctionParamsSchema = (z: CustomZod) => {
	return getListParamsSchema(z).and(
		z.discriminatedUnion('view', [
			z.object({
				view: z.literal(findPostView.frontList),
			}),
			z.object({
				view: z.literal(findPostView.boTable),
				fromPublic: z.boolean().optional().default(false),
			}),
		]),
	);
};

// export const findOnePostView = {
// 	frontDetail: 'front-post-detail',
// 	boEditForm: 'bo-edit-form',
// } as const;

// export const getFindOnePostFunctionParamsSchema = (z: CustomZod) => {
// 	return z.discriminatedUnion('view', [
// 		z.object({
// 			view: z.literal(findOnePostView.frontDetail),
// 			slug: z.string(),
// 		}),
// 		z.object({
// 			view: z.literal(findOnePostView.boEditForm),
// 			id: z.string(),
// 		}),
// 	]);
// };
export const getGetPostFunctionFrontDetailsView = (z: CustomZod) => {
	return z.object({
		slug: z.string(),
	});
};

export const getGetPostFunctionBackOfficeEditForm = (z: CustomZod) => {
	return z.object({
		id: z.string(),
	});
};

// export type CreatePostInput = zod.infer<ReturnType<typeof getCreatePostInputSchema>>;
// export type UpdatePostInput = zod.infer<ReturnType<typeof getUpdatePostInputSchema>>;
