import type { LoaderFunctionArgs } from '@remix-run/server-runtime';

import type { ParseApi } from '@devist/api/parse/ParseApi';

import type { AppLocale } from '@/shared/lib/i18n/resources';

import { remixI18NextServer } from '../i18n/i18next.server';
import { returnLanguageIfSupported } from '../i18n/i18nextCommonUtils';
import { initParseOnServer } from '../parse/initParseOnServer';

type InnerLoaderFunction<T> = (
	args: LoaderFunctionArgs & { parseApi: ParseApi; locale: AppLocale; _locale: AppLocale | undefined },
) => Promise<T>;

type ReturnedLoaderFunction<T> = (args: LoaderFunctionArgs) => Promise<T>;

export const getServerLoader = <T>(innerLoader: InnerLoaderFunction<T>): ReturnedLoaderFunction<T> => {
	const loader = async (loaderFunctionArgs: LoaderFunctionArgs) => {
		const { params, request } = loaderFunctionArgs;

		const lang = returnLanguageIfSupported(params.lang);
		const locale = lang ?? ((await remixI18NextServer.getLocale(request)) as AppLocale);

		const parseApi = await initParseOnServer({ locale });

		return innerLoader({ ...loaderFunctionArgs, parseApi, locale, _locale: lang });
	};

	return loader;
};
