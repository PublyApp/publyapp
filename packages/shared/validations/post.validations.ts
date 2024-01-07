import { type TFunction } from 'i18next';
import { z } from 'zod';

import { appLocales } from '@/shared/lib/i18n/resources';

import { getErrorMap } from '../lib/zod';

// import { postContentTypes } from '../types/db/post.types';

// const getPostContentSchema = (t: TFunction) => {
// 	// const TYPE = 'Type';
// 	const CONTENT = t('common:content');

// 	return z
// 		.string({ errorMap: getErrorMap(t, { field: CONTENT }) })
// 		.min(1, { message: t('common:form.error.required', { field: CONTENT }) });

// 	// const getTypeSchema = <T extends string = string>(contentType: T) => {
// 	// 	return z.literal(contentType /* postContentTypes[0] */, {
// 	// 		invalid_type_error: t('common:form.error.invalid', { field: TYPE }),
// 	// 		required_error: t('common:form.error.required', { field: TYPE }),
// 	// 	});
// 	// };

// 	// return z.discriminatedUnion('type', [
// 	// 	z.object({
// 	// 		type: getTypeSchema(postContentTypes[0]),
// 	// 		value: z
// 	// 			.string({ errorMap: getErrorMap(t, { field: CONTENT }) })
// 	// 			.min(1, { message: t('common:form.error.required', { field: CONTENT }) }),
// 	// 	}),
// 	// 	z.object({
// 	// 		type: getTypeSchema(postContentTypes[1]),
// 	// 		value: z.unknown(),
// 	// 	}),
// 	// ]);
// };

const SLUG_REGEX = /^[a-z0-9-]+$/;

// const getSlugSchema = (t: TFunction) => {
// 	return z
// };

const getLocaleSchema = (t: TFunction) => {
	const LOCALE = t('common:locale');

	return z.enum(appLocales, {
		invalid_type_error: t('common:form.error.invalid', { field: LOCALE }),
		required_error: t('common:form.error.required', { field: LOCALE }),
	});
};

export const getCreatePostInputSchema = (t: TFunction) => {
	const TITLE = t('common:title');
	const SLUG = 'Slug';
	const DESCRIPTION = 'Description';
	const CONTENT = t('common:content');
	const AUTHOR_ID = 'authorId';
	const COVER = t('common:cover');
	// const DESCRIPTION = t('common:description')

	const TITLE_MAX_LENGTH = 170;
	const DESCRIPTION_MAX_LENGTH = 300;

	return z.object({
		// objectId: z.string({ errorMap: getErrorMap(t, { field: ID }) }).optional(),
		// published: z.boolean({ errorMap: getErrorMap(t, { field: PUBLISHED }) }).optional(),
		locale: getLocaleSchema(t),
		title: z
			.string({ errorMap: getErrorMap(t, { field: TITLE }) })
			.min(1, { message: t('common:form.error.required', { field: TITLE }) })
			.max(TITLE_MAX_LENGTH, {
				message: t('common:form.error.maxLength', { field: TITLE, maxLength: TITLE_MAX_LENGTH }),
			}),
		slug: z
			.string({ errorMap: getErrorMap(t, { field: SLUG }) })
			.min(1, { message: t('common:form.error.required', { field: SLUG }) })
			.regex(SLUG_REGEX, t('common:form.error.invalid', { field: SLUG })),
		description: z
			.string({ errorMap: getErrorMap(t, { field: DESCRIPTION }) })
			.min(1, { message: t('common:form.error.required', { field: DESCRIPTION }) })
			.max(DESCRIPTION_MAX_LENGTH, {
				message: t('common:form.error.maxLength', { field: DESCRIPTION, maxLength: DESCRIPTION_MAX_LENGTH }),
			}),
		// content: getPostContentSchema(t),
		content: z
			.string({ errorMap: getErrorMap(t, { field: CONTENT }) })
			.min(1, { message: t('common:form.error.required', { field: CONTENT }) }),
		authorId: z
			.string({ errorMap: getErrorMap(t, { field: AUTHOR_ID }) })
			// .min(1, { message: t('common:form.error.required', { field: AUTHOR_ID }) })
			.optional(),
		coverId: z
			.string({ errorMap: getErrorMap(t, { field: COVER }) })
			.min(1, { message: t('common:form.error.required', { field: COVER }) })
			.optional(),
	});
};

export const getUpdatePostInputSchema = (t: TFunction) => {
	const ID = 'ObjectId';
	const PUBLISHED = t('common:published');

	return getCreatePostInputSchema(t)
		.omit({ locale: true })
		.partial()
		.extend({
			objectId: z
				.string({ errorMap: getErrorMap(t, { field: ID }) })
				.min(1, { message: t('common:form.error.required', { field: ID }) }),
			published: z.boolean({ errorMap: getErrorMap(t, { field: PUBLISHED }) }).optional(),
			locale: getLocaleSchema(t),
		});
};

export type CreatePostInput = z.infer<ReturnType<typeof getCreatePostInputSchema>>;
export type UpdatePostInput = z.infer<ReturnType<typeof getUpdatePostInputSchema>>;
