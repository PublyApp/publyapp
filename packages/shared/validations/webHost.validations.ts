import { type TFunction } from 'i18next';
import { z } from 'zod';

import { appLocales } from '@shared/i18n/resources';

import { getErrorMap } from '../utils/zodConfig';

// export const getCreateWebHostInputSchema = (t: TFunction) => {
// 	const name = t('common:name');

// 	return z.object({
// 		name: z
// 			.string({ errorMap: getErrorMap(t, { field: name }) })
// 			.min(1, { message: t('common:form.error.required', { field: name }) as string }),
// 		description: z.string().optional(),
// 		// TODO: add locale field
// 		// locale: z.enum();
// 	});
// };

// const MAX_FILE_SIZE = 500000;
// const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// const imageSchema = z
// 	.any()
// 	.refine((file) => {
// 		return file?.size <= MAX_FILE_SIZE;
// 	}, 'Max image size is 5MB.')
// 	.refine((file) => {
// 		return ACCEPTED_IMAGE_TYPES.includes(file?.type);
// 	}, 'Only .jpg, .jpeg, .png and .webp formats are supported.');

// import { z } from 'zod';

// const MB_BYTES = 1000000; // Number of bytes in a megabyte.

// This is the list of mime types you will accept with the schema
// const ACCEPTED_MIME_TYPES = ["image/gif", "image/jpeg", "image/png"];

// This is a file validation with a few extra checks in the `superRefine`.
// The `refine` method could also be used, but `superRefine` offers better
// control over when the errors are added and can include specific information
// about the value being parsed.
// const imageSchema = z.instanceof(File).superRefine((f, ctx) => {
//   // First, add an issue if the mime type is wrong.
//   if (!ACCEPTED_MIME_TYPES.includes(f.type)) {
//     ctx.addIssue({
//       code: z.ZodIssueCode.custom,
//       message: `File must be one of [${ACCEPTED_MIME_TYPES.join(
//         ", "
//       )}] but was ${f.type}`
//     });
//   }
//   // Next add an issue if the file size is too large.
//   if (f.size > 3 * MB_BYTES) {
//     ctx.addIssue({
//       code: z.ZodIssueCode.too_big,
//       type: "array",
//       message: `The file must not be larger than ${3 * MB_BYTES} bytes: ${
//         f.size
//       }`,
//       maximum: 3 * MB_BYTES,
//       inclusive: true
//     });
//   }
// });

export const getSaveWebHostInputSchema = (t: TFunction) => {
	const NAME = t('common:name');
	const DESCRIPTION = 'description';

	return z.object({
		objectId: z.string({ errorMap: getErrorMap(t, { field: 'objectId' }) }).optional(),
		name: z
			.string({ errorMap: getErrorMap(t, { field: NAME }) })
			.min(1, { message: t('common:form.error.required', { field: NAME }) as string }),
		description: z
			.string({ errorMap: getErrorMap(t, { field: DESCRIPTION }) })
			.min(1, { message: t('common:form.error.required', { field: DESCRIPTION }) as string }),
		locale: z.enum(appLocales).optional(),
		image: z.any().optional(), // TODO: replace
	});
};

// export type CreateWebHostInput = z.infer<ReturnType<typeof getCreateWebHostInputSchema>>;
export type SaveWebHostInput = z.infer<ReturnType<typeof getSaveWebHostInputSchema>>;
