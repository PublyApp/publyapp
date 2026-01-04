import type { ClientLoaderFunctionArgs } from 'react-router';

import type { AppLocale } from '@/shared/lib/i18n/resources';
import type InterZod from '@/shared/lib/zod/InterZod';

import { initI18nOnClient } from '../i18n/init-i18n.client';
import { initZodOnClient } from '../zod/zod.client';
import { getRequestLocale } from './data.utils';

type GetCLientLoaderParams<
	T extends ClientLoaderFunctionArgs = ClientLoaderFunctionArgs,
	D = unknown,
> = {
	loader: (
		args: T & {
			z: InterZod;
			locale: AppLocale;
		},
	) => Promise<D>;
};

type GetCLientLoader = <
	T extends ClientLoaderFunctionArgs = ClientLoaderFunctionArgs,
	D = unknown,
>(
	params: GetCLientLoaderParams<T, D>,
) => ((args: T) => Promise<D>) & { hydrate?: boolean };

/**
 * Creates a client loader with common utilities (i18n, zod).
 *
 * To access API clients in loaders, use clientManager directly:
 * - `clientManager.getOrCreateClient(tenantId)` - for tenant-scoped requests
 * - `clientManager.getStaffClient()` - for staff requests
 * - `clientManager.getAnonymousClient()` - for public/anonymous requests
 *
 * Session tokens are read fresh from cookies on every request.
 */
export const getClientLoader: GetCLientLoader = <
	T extends ClientLoaderFunctionArgs = ClientLoaderFunctionArgs,
	D = unknown,
>(
	params: GetCLientLoaderParams<T, D>,
) => {
	const loader = async (args: T) => {
		const { request } = args;
		const locale = getRequestLocale(request);

		const i18n = await initI18nOnClient();
		const z = initZodOnClient(i18n);

		return params.loader({ ...args, z, locale });
	};

	return loader;
};
