import parseApi from '@devist/api/parse/ParseApi';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import { defaultLocale } from '@/shared/lib/i18n/resources';

import { returnLanguageIfSupported } from '../i18n/i18nextCommonUtils';

import { parseRestClient } from './client';

export const initParseOnClient = () => {
	// get local from url
	const localeInUrl: string | undefined = window.location.pathname.split('/')[1];
	const locale = returnLanguageIfSupported(localeInUrl) ?? defaultLocale;

	// set locale header
	parseRestClient.setHeader(LOCALE_HEADER_KEY, locale);

	parseApi.setRestClient(parseRestClient);
};
