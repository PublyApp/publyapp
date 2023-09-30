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
	});
};

// export type CreateWebHostInput = z.infer<ReturnType<typeof getCreateWebHostInputSchema>>;
export type SaveWebHostInput = z.infer<ReturnType<typeof getSaveWebHostInputSchema>>;
