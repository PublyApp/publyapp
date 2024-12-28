import type { ApiClient } from 'packages/api/ApiClient';
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';

import { FRONT_PATH_NAMES, queryParamKey, SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';
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

const getRequestCookie = (request: Request, cookieName: string) => {
	const cookies = request.headers.getSetCookie();
	const value = cookies.find((cookie) => {
		return cookie.startsWith(`${cookieName}=`);
	});

	return value;
};

type GetServerLoaderParamsWhenRequireUser<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> = {
	requireUser: true;
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

type GetServerLoader = {
	<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown>(
		params: GetServerLoaderParamsWhenRequireUser<T, D>,
	): (args: T) => Promise<D>;
	<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown>(
		params: GetServerLoaderParamsWithoutAuthDataPromise<T, D>,
	): (args: T) => Promise<D>;
	<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown>(
		params: GetServerLoaderParamsWithAuthDataPromise<T, D>,
	): (args: T) => Promise<D>;
};

type GetServerLoaderParam<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> =
	| GetServerLoaderParamsWhenRequireUser<T, D>
	| GetServerLoaderParamsWithoutAuthDataPromise<T, D>
	| GetServerLoaderParamsWithAuthDataPromise<T, D>;

export const getServerLoader: GetServerLoader = <T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown>(
	params: GetServerLoaderParam<T, D>,
) => {
	const loader = async (args: T) => {
		const { request } = args;
		const locale = getRequestLocale(request);

		const z = new CustomZod({ i18n: remixI18NextServer as never, locale });

		if (!params.requireUser) {
			const apiClient = initApiClient.onServer({ locale });

			if (!params.withAuthDataPromise) {
				return params.loader({ ...args, apiClient, z, locale });
			}

			const authDataPromise = apiClient.auth.getUserAuthData();

			return params.loader({ ...args, apiClient, z, locale, authDataPromise });
		}

		// check if session token cookie is present
		const sessionTokenCookie = getRequestCookie(request, SESSION_TOKEN_COOKIE_KEY);

		let sessionToken: string | undefined;

		if (sessionTokenCookie) {
			[, sessionToken] = sessionTokenCookie.split('=');
		}

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.login) as never;
		}

		const apiClient = initApiClient.onServer({ locale, sessionToken });
		const authData = await apiClient.auth.getUserAuthData();

		return params.loader({ ...args, apiClient, z, locale, authData });
	};

	return loader;
};

// type GetServerActionParams<R> = {
// 	action: (
// 		args: ActionFunctionArgs & {
// 			z: CustomZod;
// 			locale: AppLocale;
// 			apiClient: ApiClient;
// 		},
// 	) => Promise<R>;
// };

type GetServerActionParamsWhenRequireUser<T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown> = {
	requireUser: true;
	action: (
		args: T & {
			z: CustomZod;
			locale: AppLocale;
			apiClient: ApiClient;
			authData: Awaited<ReturnType<ApiClient['auth']['getUserAuthData']>>;
		},
	) => Promise<D>;
};

type GetServerAction = {
	<T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown>(
		prams: GetServerActionParamsWhenRequireUser<T, D>,
	): (args: T) => Promise<D>;
};

export const getServerAction = async (prams: GetServerActionParams<R>) => {
	const action = async (args: ActionFunctionArgs) => {
		const locale = getRequestLocale(args.request);
		const z = new CustomZod({ i18n: remixI18NextServer as never, locale });
		const apiClient = initApiClient.onServer({ locale });

		return prams.action({ ...args, apiClient, z, locale });
	};

	return action;
};
