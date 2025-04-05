import type { ApiClient } from 'packages/api/ApiClient';
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';

import { FRONT_PATH_NAMES, SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import InterZod from '@/shared/lib/zod/InterZod';

import { initApiClientOnServer } from '../api';
import { CookieManager } from '../cookie-manager';
import { remixI18NextServer } from '../i18n/i18n.server';

import { getRequestLocale } from './data.utils';

type GetServerLoaderParamsWhenRequireUser<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> = {
	requireUser: true;
	loader: (
		args: T & {
			z: InterZod;
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
			z: InterZod;
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
			z: InterZod;
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

type GetServerLoaderParams<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> =
	| GetServerLoaderParamsWhenRequireUser<T, D>
	| GetServerLoaderParamsWithoutAuthDataPromise<T, D>
	| GetServerLoaderParamsWithAuthDataPromise<T, D>;

export const getServerLoader: GetServerLoader = <T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown>(
	params: GetServerLoaderParams<T, D>,
) => {
	const loader = async (args: T) => {
		const { request } = args;
		const locale = getRequestLocale(request);
		const z = new InterZod({ i18n: remixI18NextServer as never, locale });
		const requestIp = args.request.headers.get('x-forwarded-for') || args.request.headers.get('x-real-ip');

		if (!params.requireUser) {
			const apiClient = initApiClientOnServer({ locale, requestIp });

			if (!params.withAuthDataPromise) {
				return params.loader({ ...args, apiClient, z, locale });
			}

			const authDataPromise = apiClient.auth.getUserAuthData();

			return params.loader({ ...args, apiClient, z, locale, authDataPromise });
		}

		// check if session token cookie is present
		const reqCookies = new CookieManager(request.headers);
		const sessionToken = reqCookies.get(SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.auth.login) as never;
		}

		const apiClient = initApiClientOnServer({ locale, sessionToken, requestIp });
		const authData = await apiClient.auth.getUserAuthData();

		return params.loader({ ...args, apiClient, z, locale, authData });
	};

	return loader;
};

type GetServerActionParamsWhenRequireUser<T extends ActionFunctionArgs = ActionFunctionArgs, D = unknown> = {
	requireUser: true;
	action: (
		args: T & {
			z: InterZod;
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
			z: InterZod;
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
		const z = new InterZod({ i18n: remixI18NextServer as never, locale });
		const requestIp = args.request.headers.get('x-forwarded-for') || args.request.headers.get('x-real-ip');

		if (!params.requireUser) {
			const apiClient = initApiClientOnServer({ locale, requestIp });
			return params.action({ ...args, apiClient, z, locale });
		}

		const reqCookies = new CookieManager(args.request.headers);
		const sessionToken = reqCookies.get(SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.auth.login) as never;
		}

		const apiClient = initApiClientOnServer({ locale, sessionToken, requestIp });

		const authData = await apiClient.auth.getUserAuthData();

		return params.action({ ...args, apiClient, z, locale, authData });
	};

	return action;
};
