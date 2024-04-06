import { appLocales } from '../lib/i18n/resources';
import type CustomZod from '../lib/zod/CustomZod';

export const getLocaleSchema = (z: CustomZod) => {
	return z.enum(appLocales);
};
