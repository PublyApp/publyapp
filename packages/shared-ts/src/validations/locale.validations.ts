import { appLocales } from '../lib/i18n/resources';
import type { ZodI18n } from '../lib/zod/zod-i18n';

export const getLocaleSchema = (z: ZodI18n) => {
	return z.enum(appLocales);
};
