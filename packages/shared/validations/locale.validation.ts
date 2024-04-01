import { appLocales } from '../lib/i18n/resources';
import type CustomZod from '../lib/zod/CustomZod';

export const getLocaleSchema = (z: CustomZod) => {
	// const LOCALE = z.t('common:locale');

	return z.enum(
		appLocales,
		// 	, {
		// 	invalid_type_error: z.t('common:form.error.invalid', { field: LOCALE }),
		// 	required_error: z.t('common:form.error.required', { field: LOCALE }),
		// }
	);
};
