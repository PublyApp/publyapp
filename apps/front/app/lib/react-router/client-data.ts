import type { LoaderFunctionArgs } from 'react-router';
import type { ApiClient } from '@/js-client/src/apiClient';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import type InterZod from '@/shared/lib/zod/InterZod';
import { initApiClientOnClient } from '../api';
import { initI18nOnClient } from '../i18n/init-i18n.client';
import { initZodOnClient } from '../zod/zod.client';
import { getRequestLocale } from './data.utils';

type GetCLientLoaderParams<
	T extends LoaderFunctionArgs = LoaderFunctionArgs,
	D = unknown,
> = {
	loader: (
		args: T & {
			z: InterZod;
			locale: AppLocale;
			apiClient: ApiClient;
		},
	) => Promise<D>;
};

type GetCLientLoader = <
	T extends LoaderFunctionArgs = LoaderFunctionArgs,
	D = unknown,
>(
	params: GetCLientLoaderParams<T, D>,
) => (args: T) => Promise<D>;

export const getClientLoader: GetCLientLoader = <
	T extends LoaderFunctionArgs = LoaderFunctionArgs,
	D = unknown,
>(
	params: GetCLientLoaderParams<T, D>,
) => {
	const loader = async (args: T) => {
		const { request } = args;
		const locale = getRequestLocale(request);

		const i18n = await initI18nOnClient();
		const z = initZodOnClient(i18n);
		const apiClient = initApiClientOnClient();

		return params.loader({ ...args, apiClient, z, locale });
	};

	return loader;
};
