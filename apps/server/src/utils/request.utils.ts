import type { Request } from 'express';
import _ from 'lodash';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import InterZod from '@/shared/lib/zod/InterZod';

import { i18nextServer } from '../lib/i18n';

export const getHeader = (req: Request, key: string) => {
	return req.get(key) || req.get(_.toLower(key));
};

export const getRequestUtils = (req: Request) => {
	const localeInHeaders = getHeader(req, LOCALE_HEADER_KEY);
	const locale = getCorrectLocale(localeInHeaders);
	const z = new InterZod({ i18n: i18nextServer, locale });
	const { t } = z;

	return {
		locale,
		t,
		z,
	};
};

export const getRequestIp = (req: Request) => {
	return getHeader(req, 'X-Forwarded-For') || req.socket.remoteAddress;
};
