import * as cookie from 'cookie';
import _ from 'lodash';
import {
	type ActionFunctionArgs,
	type AppLoadContext,
	type LoaderFunctionArgs,
	redirect,
} from 'react-router';

import {
	FRONT_PATH_NAMES,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import InterZod from '@/shared/lib/zod/InterZod';
import { isPromise } from '@/shared/utils/any.utils';

import { parseSessionCookie } from '../cookies/session-cookie.utils';
import { remixI18NextServer } from '../i18n/i18n.server';
import { getRequestLocale } from './data.utils';

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
			/** Primary token (tenantToken ?? staffToken) - guaranteed when requireUser */
			sessionToken: string;
			/** Staff session token (for staff UI) */
			staffToken?: string;
			/** Tenant session token (for tenant UI/impersonation) */
			tenantToken?: string;
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
			/** Primary token (tenantToken ?? staffToken) */
			sessionToken: string | undefined;
			/** Staff session token (for staff UI) */
			staffToken?: string;
			/** Tenant session token (for tenant UI/impersonation) */
			tenantToken?: string;
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
			/** Primary token (tenantToken ?? staffToken) */
			sessionToken: string | undefined;
			/** Staff session token (for staff UI) */
			staffToken?: string;
			/** Tenant session token (for tenant UI/impersonation) */
			tenantToken?: string;
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

		const finalLoadContext = args.context;

		// Extract and parse session token(s) from cookies
		const reqCookies = cookie.parse(args.request.headers.get('Cookie') || '');
		const rawCookieValue = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY) as
			| string
			| undefined;

		// Parse dual-token format (handles legacy single-token format too)
		const tokens = rawCookieValue ? parseSessionCookie(rawCookieValue) : {};
		const sessionToken = tokens.tenantToken ?? tokens.staffToken;

		// Redirect to login if user is required but no session token
		if (params.requireUser && !sessionToken) {
			return redirect(FRONT_PATH_NAMES.auth.login) as never;
		}

		// Pass all tokens to loader - caller can use sessionToken (primary) or specific tokens
		return params.loader({
			...args,
			context: finalLoadContext,
			sessionToken: sessionToken as never,
			staffToken: tokens.staffToken,
			tenantToken: tokens.tenantToken,
			z,
			locale,
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
			/** Primary token (tenantToken ?? staffToken) - guaranteed when requireUser */
			sessionToken: string;
			/** Staff session token (for staff UI) */
			staffToken?: string;
			/** Tenant session token (for tenant UI/impersonation) */
			tenantToken?: string;
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
			/** Primary token (tenantToken ?? staffToken) */
			sessionToken: string | undefined;
			/** Staff session token (for staff UI) */
			staffToken?: string;
			/** Tenant session token (for tenant UI/impersonation) */
			tenantToken?: string;
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

		const finalLoadContext = args.context;

		// Extract and parse session token(s) from cookies
		const reqCookies = cookie.parse(args.request.headers.get('Cookie') || '');
		const rawCookieValue = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY) as
			| string
			| undefined;

		// Parse dual-token format (handles legacy single-token format too)
		const tokens = rawCookieValue ? parseSessionCookie(rawCookieValue) : {};
		const sessionToken = tokens.tenantToken ?? tokens.staffToken;

		// Redirect to login if user is required but no session token
		if (params.requireUser && !sessionToken) {
			return redirect(FRONT_PATH_NAMES.auth.login) as never;
		}

		// Pass all tokens to action - caller can use sessionToken (primary) or specific tokens
		return params.action({
			...args,
			context: finalLoadContext,
			sessionToken: sessionToken as never,
			staffToken: tokens.staffToken,
			tenantToken: tokens.tenantToken,
			z,
			locale,
		});
	};

	return action;
};
