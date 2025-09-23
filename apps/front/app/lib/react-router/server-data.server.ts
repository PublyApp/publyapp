// import type { ApiClient } from '@/parse-api-client/ApiClient';
// import { clientManager } from '../js-client/client-manager';

import type { ApiClient } from '@org/js-client/src/apiClient';
import * as cookie from 'cookie';
import _ from 'lodash';
import {
	type ActionFunctionArgs,
	type AppLoadContext,
	type LoaderFunctionArgs,
	redirect,
} from 'react-router';
import {
	// CLOUDFLARE_CONNECTING_IP_HEADER_KEY,
	// FORWARDED_FOR_HEADER_KEY,
	FRONT_PATH_NAMES,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import InterZod from '@/shared/lib/zod/InterZod';
import { isPromise } from '@/shared/utils/any.utils';
import { initApiClientOnServer } from '../api';
import { remixI18NextServer } from '../i18n/i18n.server';
import { getRequestLocale } from './data.utils';
import { getDevContext } from './get-dev-context.server';

type GetServerLoaderParamsWhenRequireUser<
	T extends
		LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
	D = unknown,
> = {
	requireUser: true;
	loader: (
		args: T & {
			z: InterZod;
			locale: AppLocale;
			apiClient: ApiClient;
			// authData: Awaited<ReturnType<ApiClient['auth']['getUserAuthData']>>;
		},
	) => Promise<D>;
};

type GetServerLoaderParamsWithoutAuthDataPromise<
	T extends
		LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
	D = unknown,
> = {
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

type GetServerLoaderParamsWithAuthDataPromise<
	T extends
		LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
	D = unknown,
> = {
	requireUser?: false | undefined;
	withAuthDataPromise: true;
	loader: (
		args: T & {
			z: InterZod;
			locale: AppLocale;
			apiClient: ApiClient;
			// authDataPromise: ReturnType<ApiClient['auth']['getUserAuthData']>;
		},
	) => Promise<D>;
};

type GetServerLoader = {
	<
		T extends
			LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
		D = unknown,
	>(
		params: GetServerLoaderParamsWhenRequireUser<T, D>,
	): (args: T) => Promise<D>;
	<
		T extends
			LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
		D = unknown,
	>(
		params: GetServerLoaderParamsWithoutAuthDataPromise<T, D>,
	): (args: T) => Promise<D>;
	<
		T extends
			LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
		D = unknown,
	>(
		params: GetServerLoaderParamsWithAuthDataPromise<T, D>,
	): (args: T) => Promise<D>;
};

type GetServerLoaderParams<
	T extends
		LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
	D = unknown,
> =
	| GetServerLoaderParamsWhenRequireUser<T, D>
	| GetServerLoaderParamsWithoutAuthDataPromise<T, D>
	| GetServerLoaderParamsWithAuthDataPromise<T, D>;

export const getServerLoader: GetServerLoader = <
	T extends
		LoaderFunctionArgs<AppLoadContext> = LoaderFunctionArgs<AppLoadContext>,
	D = unknown,
>(
	params: GetServerLoaderParams<T, D>,
) => {
	const loader = async (args: T) => {
		const locale = getRequestLocale(args.request);
		const z = new InterZod({ i18n: remixI18NextServer as never, locale });

		if (isPromise(z.t)) {
			// @ts-expect-error - t is a promise
			z._t = await z.t;
		}

		const finalLoadContext = getDevContext(args.context);

		// const requestIp =
		// 	args.request.headers.get(
		// 		_.toLower(CLOUDFLARE_CONNECTING_IP_HEADER_KEY),
		// 	) || // ✅ Cloudflare real IP
		// 	args.request.headers.get(_.toLower(FORWARDED_FOR_HEADER_KEY));

		if (!params.requireUser) {
			const apiClient = initApiClientOnServer({
				/* locale, requestIp */
			});

			if (!params.withAuthDataPromise) {
				return params.loader({
					...args,
					context: finalLoadContext,
					apiClient,
					z,
					locale,
				});
			}

			// const authDataPromise = apiClient.auth.getUserAuthData();

			return params.loader({
				...args,
				context: finalLoadContext,
				apiClient,
				z,
				locale,
				// authDataPromise,
			});
		}

		// check if session token cookie is present
		const reqCookies = cookie.parse(
			args.request.headers.get('Set-Cookie') || '',
		);
		const sessionToken = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.auth.login) as never;
		}

		const apiClient = initApiClientOnServer({
			// locale,
			sessionToken,
			// requestIp,
		});
		// const authData = await apiClient.auth.getUserAuthData();

		return params.loader({
			...args,
			context: finalLoadContext,
			apiClient,
			z,
			locale,
			// authData,
		});
	};

	return loader;
};

type GetServerActionParamsWhenRequireUser<
	T extends ActionFunctionArgs = ActionFunctionArgs,
	D = unknown,
> = {
	requireUser: true;
	action: (
		args: T & {
			z: InterZod;
			locale: AppLocale;
			apiClient: ApiClient;
			// authData: Awaited<ReturnType<ApiClient['auth']['getUserAuthData']>>;
		},
	) => Promise<D>;
};

type GetServerActionParamsWhenWhenUserNotRequired<
	T extends ActionFunctionArgs = ActionFunctionArgs,
	D = unknown,
> = {
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
	<
		T extends
			ActionFunctionArgs<AppLoadContext> = ActionFunctionArgs<AppLoadContext>,
		D = unknown,
	>(
		params: GetServerActionParamsWhenRequireUser<T, D>,
	): (args: T) => Promise<D>;
	<
		T extends
			ActionFunctionArgs<AppLoadContext> = ActionFunctionArgs<AppLoadContext>,
		D = unknown,
	>(
		params: GetServerActionParamsWhenWhenUserNotRequired<T, D>,
	): (args: T) => Promise<D>;
};

type GetServerActionParams<
	T extends
		ActionFunctionArgs<AppLoadContext> = ActionFunctionArgs<AppLoadContext>,
	D = unknown,
> =
	| GetServerActionParamsWhenRequireUser<T, D>
	| GetServerActionParamsWhenWhenUserNotRequired<T, D>;

export const getServerAction: GetServerAction = <
	T extends
		ActionFunctionArgs<AppLoadContext> = ActionFunctionArgs<AppLoadContext>,
	D = unknown,
>(
	params: GetServerActionParams<T, D>,
) => {
	const action = async (args: T) => {
		const locale = getRequestLocale(args.request);
		const z = new InterZod({ i18n: remixI18NextServer as never, locale });

		if (isPromise(z.t)) {
			// @ts-expect-error - z.t is a promise
			z._t = await z.t;
		}

		const finalLoadContext = getDevContext(args.context);

		// const requestIp =
		// 	args.request.headers.get(
		// 		_.toLower(CLOUDFLARE_CONNECTING_IP_HEADER_KEY),
		// 	) || // ✅ Cloudflare real IP
		// 	args.request.headers.get(_.toLower(FORWARDED_FOR_HEADER_KEY));

		if (!params.requireUser) {
			const apiClient = initApiClientOnServer({
				/* locale, requestIp */
			});
			return params.action({
				...args,
				context: finalLoadContext,
				apiClient,
				z,
				locale,
			});
		}

		const reqCookies = cookie.parse(
			args.request.headers.get('Set-Cookie') || '',
		);
		const sessionToken = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			return redirect(FRONT_PATH_NAMES.auth.login) as never;
		}

		const apiClient = initApiClientOnServer({
			sessionToken,
			// locale,
			// requestIp,
		});

		// ! Don't force every loader to have auth data
		// ! Let the developer decide if they want to have auth data or not
		// ! in their implementation
		// const authData = await apiClient.auth.getUserAuthData();

		return params.action({
			...args,
			context: finalLoadContext,
			apiClient,
			z,
			locale,
			// authData,
		});
	};

	return action;
};
