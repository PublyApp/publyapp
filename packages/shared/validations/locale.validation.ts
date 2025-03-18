import { appLocales } from '../lib/i18n/resources';
import type InterZod from '../lib/zod/InterZod';

export const getLocaleSchema = (z: InterZod) => {
	return z.enum(appLocales);
};
