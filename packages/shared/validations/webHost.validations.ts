import { type TFunction } from 'i18next';
import { z } from 'zod';

import { appLocales } from '@shared/lib/i18n/resources';

import { getErrorMap } from '../lib/zod';

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

export type SaveWebHostInput = z.infer<ReturnType<typeof getSaveWebHostInputSchema>>;
