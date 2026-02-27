import type { ClientLoaderFunctionArgs } from 'react-router';

import type { AppLocale } from '@org/shared-ts/lib/i18n/resources';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

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
 * To access API clients in loaders, use `ClientManager` directly:
 * - `getClientManager().getOrCreateClient(tenantId)` - for tenant-scoped requests
 * - `getClientManager().getOrCreateStaffClient()` - for staff requests
 * - `getClientManager().getOrCreateAnonymousClient()` - for public/anonymous requests
 * - `getClientManager().createClient({ tenantId?, skipAuth?, context? })` - for ad-hoc clients
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
