import type { ApiClient } from 'packages/api/ApiClient';
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';

import { FRONT_PATH_NAMES, queryParamKey } from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import CustomZod from '@/shared/lib/zod/CustomZod';

import { initApiClient } from '../api';
import { remixI18NextServer } from '../i18n/i18n.server';

const getRequestLocale = (request: Request) => {
	const url = new URL(request.url);
	const language = url.searchParams.get(queryParamKey.language);
	const locale = getCorrectLocale(language);
	return locale;
};

type GetServerLoaderParam<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> =
	| {
			requireUser: true;
			loader: (
				args: T & {
					z: CustomZod;
					locale: AppLocale;
					apiClient: ApiClient;
					getUserAuthDataPromise: ReturnType<ApiClient['auth']['getUserAuthData']>;
				},
			) => Promise<D>;
	  }
	| {
			requireUser?: boolean | undefined;
			loader: (
				args: T & {
					z: CustomZod;
					locale: AppLocale;
					apiClient: ApiClient;
				},
			) => Promise<D>;
	  };

type GetServerLoaderParamsWhenRequireUser<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> = {
	requireUser: true;
	// withAuthDataPromise?: undefined;
	loader: (
		args: T & {
			z: CustomZod;
			locale: AppLocale;
			apiClient: ApiClient;
			authData: Awaited<ReturnType<ApiClient['auth']['getUserAuthData']>>;
		},
	) => Promise<D>;
};

type GetServerLoaderParamsWithoutAuthDataPromise<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> = {
	requireUser?: false | undefined;
	withAuthDataPromise?: false | undefined;
	loader: (
		args: T & {
			z: CustomZod;
			locale: AppLocale;
			apiClient: ApiClient;
		},
	) => Promise<D>;
};

type GetServerLoaderParamsWithAuthDataPromise<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> = {
	requireUser?: false | undefined;
	withAuthDataPromise: true;
	loader: (
		args: T & {
			z: CustomZod;
			locale: AppLocale;
			apiClient: ApiClient;
			authDataPromise: ReturnType<ApiClient['auth']['getUserAuthData']>;
		},
	) => Promise<D>;
};

type GetServerLoader<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> = {
	(params: GetServerLoaderParamsWhenRequireUser<T, D>): (args: LoaderFunctionArgs) => Promise<D>;
	(params: GetServerLoaderParamsWithoutAuthDataPromise<T, D>): (args: LoaderFunctionArgs) => Promise<D>;
	(params: GetServerLoaderParamsWithAuthDataPromise<T, D>): (args: LoaderFunctionArgs) => Promise<D>;
};

export const getServerLoader = <T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown>(
	params: GetServerLoaderParam<T, D>,
) => {
	const loader = async (args: T) => {
		const { request } = args;
		const locale = getRequestLocale(request);

		const z = new CustomZod({ i18n: remixI18NextServer as never, locale });

		if (!params.requireUser) {
			const apiClient = initApiClient.onServer({ locale });
			return params.loader({ ...args, apiClient, z, locale });
		}

		// check if session token cookie is present
		const cookies = args.request.headers.getSetCookie();
		const sessionTokenCookie = cookies?.find((cookie) => {
			return cookie.startsWith('session_token=');
		});

		let sessionToken: string | undefined;

		if (sessionTokenCookie) {
			[, sessionToken] = sessionTokenCookie.split('=');
		}

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.login) as never;
		}

		const apiClient = initApiClient.onServer({ locale, sessionToken });

		const getUserAuthDataPromise = apiClient.auth.getUserAuthData();

		return params.loader({ ...args, apiClient, getUserAuthDataPromise, z, locale });
	};

	return loader;
};

type GetServerActionParams<R> = {
	action: (
		args: ActionFunctionArgs & {
			z: CustomZod;
			locale: AppLocale;
			apiClient: ApiClient;
		},
	) => Promise<R>;
};

export const getServerAction = async <R>(prams: GetServerActionParams<R>) => {
	const action = async (args: ActionFunctionArgs) => {
		const locale = getRequestLocale(args.request);
		const z = new CustomZod({ i18n: remixI18NextServer as never, locale });
		const apiClient = initApiClient.onServer({ locale });

		return prams.action({ ...args, apiClient, z, locale });
	};

	return action;
};
