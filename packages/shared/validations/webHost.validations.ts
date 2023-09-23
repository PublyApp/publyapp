import { type TFunction } from 'i18next';
import { z } from 'zod';

import { getErrorMap } from '../utils/zodConfig';

export const getCreateWebHostInputSchema = (t: TFunction) => {
	const name = t('common:name');

	return z.object({
		name: z
			.string({ errorMap: getErrorMap(t, { field: name }) })
			.min(1, { message: t('common:form.error.required', { field: name }) as string }),
		description: z.string().optional(),
		// TODO: add locale field
		// locale: z.enum();
	});
};

export type CreateWebHostInput = z.infer<ReturnType<typeof getCreateWebHostInputSchema>>;
