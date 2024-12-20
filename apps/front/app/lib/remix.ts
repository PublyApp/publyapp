import type { ApiClient } from 'packages/api/ApiClient';
import { redirect, type LoaderFunctionArgs } from 'react-router';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import CustomZod from '@/shared/lib/zod/CustomZod';

import { initApiClient } from './api';

type GetServerLoaderParam<T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown> =
	| {
			requireUser: true;
			loader: (
				args: T & {
					apiClient: ApiClient;
					getUserAuthDataPromise: ReturnType<ApiClient['auth']['getUserAuthData']>;
					z: CustomZod;
				},
			) => Promise<D>;
	  }
	| {
			requireUser?: boolean | undefined;
			loader: (
				args: T & {
					apiClient: ApiClient;
					z: CustomZod;
				},
			) => Promise<D>;
	  };

export const getServerLoader = <T extends LoaderFunctionArgs = LoaderFunctionArgs, D = unknown>(
	params: GetServerLoaderParam<T, D>,
) => {
	const z = new CustomZod({ i18n, locale: 'en' });

	const loader = async (args: T) => {
		if (!params.requireUser) {
			const apiClient = initApiClient.onServer({ locale: 'en' });
			return params.loader({ ...args, apiClient, z });
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

		const apiClient = initApiClient.onServer({ locale: 'en', sessionToken });

		const getUserAuthDataPromise = apiClient.auth.getUserAuthData();

		return params.loader({ ...args, apiClient, getUserAuthDataPromise, z });
	};

	return loader;
};
