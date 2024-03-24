import type { Request } from 'express';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import CustomZod from '@/shared/lib/zod/CustomZod';

import { getCorrectLocale, getT } from '../lib/i18n';

export const getRequestUtils = (req: Request) => {
	const localeInHeaders = req.get(LOCALE_HEADER_KEY);
	const locale = getCorrectLocale(localeInHeaders);
	const t = getT(locale);
	const z = new CustomZod(t);

	return {
		locale,
		t,
		z,
	};
};
