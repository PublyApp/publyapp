import type { Request } from 'express';
import _ from 'lodash';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import CustomZod from '@/shared/lib/zod/CustomZod';

import { getCorrectLocale, getT } from '../lib/i18n';

export const getHeader = (req: Request, key: string) => {
	return req.get(key) || req.get(_.toLower(key));
};

export const getRequestUtils = (req: Request) => {
	const localeInHeaders = getHeader(req, LOCALE_HEADER_KEY);
	const locale = getCorrectLocale(localeInHeaders);
	const t = getT(locale);
	const z = new CustomZod(t);

	return {
		locale,
		t,
		z,
	};
};

export const getRequestIp = (req: Request) => {
	return getHeader(req, 'X-Forwarded-For') || req.socket.remoteAddress;
};
