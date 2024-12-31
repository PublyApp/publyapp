import type { ApiClient } from 'packages/api/ApiClient';
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';

import { getRequestCookie } from '@/front/utils/web.utils';
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
		const sessionToken = getRequestCookie(request, SESSION_TOKEN_COOKIE_KEY);
		// const rawCookies = request.headers.get('Cookie');
		// const sessionTokenCookie = createCookie(SESSION_TOKEN_COOKIE_KEY);
		// const sessionToken = await sessionTokenCookie.parse(rawCookies);

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.login) as never;
		}

		const apiClient = initApiClient.onServer({ locale, sessionToken });
		const authData = await apiClient.auth.getUserAuthData();

		return params.loader({ ...args, apiClient, z, locale, authData });
	};

	return loader;
};

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

type GetServerActionParamsWhenWhenUserNotRequired<T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown> = {
	requireUser?: false | undefined;
	action: (
		args: T & {
			z: CustomZod;
			locale: AppLocale;
			apiClient: ApiClient;
		},
	) => Promise<D>;
};

type GetServerAction = {
	<T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown>(
		params: GetServerActionParamsWhenRequireUser<T, D>,
	): (args: T) => Promise<D>;
	<T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown>(
		params: GetServerActionParamsWhenWhenUserNotRequired<T, D>,
	): (args: T) => Promise<D>;
};

type GetServerActionParams<T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown> =
	| GetServerActionParamsWhenRequireUser<T, D>
	| GetServerActionParamsWhenWhenUserNotRequired<T, D>;

export const getServerAction: GetServerAction = <T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown>(
	params: GetServerActionParams<T, D>,
) => {
	const action = async (args: T) => {
		const locale = getRequestLocale(args.request);
		const z = new CustomZod({ i18n: remixI18NextServer as never, locale });

		if (!params.requireUser) {
			const apiClient = initApiClient.onServer({ locale });
			return params.action({ ...args, apiClient, z, locale });
		}

		const sessionToken = getRequestCookie(args.request, SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.login) as never;
		}

		const apiClient = initApiClient.onServer({ locale, sessionToken });

		const authData = await apiClient.auth.getUserAuthData();

		return params.action({ ...args, apiClient, z, locale, authData });
	};

	return action;
};
