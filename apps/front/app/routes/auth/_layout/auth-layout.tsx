import * as cookie from 'cookie';
import i18next from 'i18next';
import _ from 'lodash';
import { Suspense } from 'react';
import { Outlet, redirect } from 'react-router';
import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { AuthSplitLayout } from '@/front/layouts/auth-split/layout';
import { clientManager } from '@/front/lib/js-client/client-manager';
import {
	useGetTenantAuthData,
	useGetUserAuthData,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { defaultQueryClient } from '@/front/lib/react-query/query-client';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import {
	FRONT_PATH_NAMES,
	LAST_USED_TENANT_ID_COOKIE_KEY,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';

export const loader = getServerLoader({
	loader: async ({ request }) => {
		const reqCookies = cookie.parse(request.headers.get('cookie') || '');
		const sessionToken = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			return {
				status: 'NOT_AUTHENTICATED',
			} as const;
		}

		const authedApiClient = clientManager.createApiClient(sessionToken);

		const getUserAuthData = safeRun(async () => {
			return authedApiClient.auth.userAuthData.get();
		});

		const tenantId = _.get(reqCookies, LAST_USED_TENANT_ID_COOKIE_KEY);

		const getRedirectCode = safeRun(async () => {
			return authedApiClient.auth.redirectCode.get({
				queryParameters: { tenantId },
			});
		});

		const userAuthDataPromise = getUserAuthData();
		const redirectCodePromise = getRedirectCode();

		return {
			status: 'HAS_AUTH_TOKEN',
			userAuthDataPromise,
			redirectCodePromise,
		} as const;
	},
});

export const clientLoader = getClientLoader({
	loader: async ({ serverLoader }) => {
		const serverData = await serverLoader<typeof loader>();

		if (serverData.status === 'HAS_AUTH_TOKEN') {
			const resultsArray = await Promise.all([
				serverData.userAuthDataPromise,
				serverData.redirectCodePromise,
			]);

			if (_.some(resultsArray, (result) => result.status === 'error')) {
				const errors = resultsArray.filter(
					(result) => result.status === 'error',
				);

				if (_.some(errors, (error) => error.error.message === 'Unauthorized')) {
					return null;
				}

				throw (
					_.first(errors)?.error ||
					new Error('Failed to get user auth data or redirect code')
				);
			}

			const userAuthDataResult = await serverData.userAuthDataPromise;
			const redirectCodeResult = await serverData.redirectCodePromise;

			const userAuthData =
				userAuthDataResult.status === 'success'
					? userAuthDataResult.data
					: undefined;
			const redirectCode =
				redirectCodeResult.status === 'success'
					? redirectCodeResult.data?.redirectCode
					: undefined;

			defaultQueryClient.setQueryData(
				useGetUserAuthData.getKey(),
				userAuthData,
			);

			if (redirectCode && redirectCode !== 'unauthorized') {
				defaultQueryClient.prefetchQuery({
					queryKey: useGetTenantAuthData.getKey({ tenantId: redirectCode }),
					queryFn: async ({ queryKey }) => {
						const tenantId = _.get(queryKey, '1.tenantId');
						const result = await useGetTenantAuthData.fetcher({
							tenantId: tenantId as never,
						});
						return result;
					},
				});

				if (redirectCode === 'staff') {
					return redirect(FRONT_PATH_NAMES.staff.root);
				}

				return redirect(FRONT_PATH_NAMES.tenant(redirectCode).root);
			}
		}

		i18next.loadNamespaces(['zod', 'response-message']);
		return null;
	},
});
clientLoader.hydrate = true;

const AuthLayout = () => {
	const { t } = useTranslate();

	return (
		<Suspense fallback={<SplashScreen />}>
			<AuthSplitLayout
				slotProps={{
					section: { title: t('auth-welcome-title'), subtitle: '' },
				}}
			>
				<Outlet />
			</AuthSplitLayout>
		</Suspense>
	);
};

export default AuthLayout;

export const HydrateFallback = () => {
	return <SplashScreen />;
};
