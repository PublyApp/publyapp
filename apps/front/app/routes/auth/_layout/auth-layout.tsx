import * as cookie from 'cookie';
import i18next from 'i18next';
import _ from 'lodash';
import { Suspense } from 'react';
import { data, Outlet, redirect } from 'react-router';
import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { AuthSplitLayout } from '@/front/layouts/auth-split/layout';
import { createClearSessionCookieHeaders } from '@/front/lib/cookies/server-cookie.utils';
import { clearSessionCookie } from '@/front/lib/cookies/session-cookie.utils';
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
	I18N_NAMESPACES,
	LAST_USED_TENANT_ID_COOKIE_KEY,
	queryParamKey,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

export const loader = getServerLoader({
	loader: async ({ request }) => {
		const url = new URL(request.url);
		const forceHttpOnlyClear =
			url.searchParams.get(queryParamKey.clear_http_only) === 'true';

		const reqCookies = cookie.parse(request.headers.get('cookie') || '');
		const sessionToken = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY);

		// Handle httpOnly cookie clearing (only when parameter is present AND there's a session token)
		if (forceHttpOnlyClear && sessionToken) {
			// This scenario means: server can see the cookie but JavaScript cannot (httpOnly mismatch)
			// Clear the httpOnly cookie and redirect
			const clearHeaders = createClearSessionCookieHeaders();
			url.searchParams.delete(queryParamKey.clear_http_only);
			return redirect(url.pathname + url.search, {
				headers: clearHeaders,
			});
		}

		// If no session token exists, return NOT_AUTHENTICATED
		if (!sessionToken) {
			return data({
				status: 'NOT_AUTHENTICATED',
			} as const);
		}

		// Session token exists - validate it by calling the API
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

		// Don't send clear headers when there's a valid session
		// Only the clientLoader will determine if there's an httpOnly mismatch
		return {
			status: 'HAS_AUTH_TOKEN',
			userAuthDataPromise,
			redirectCodePromise,
		} as const;
	},
});

export const clientLoader = getClientLoader({
	loader: async ({ serverLoader }) => {
		i18next
			.loadNamespaces([I18N_NAMESPACES.ZOD, I18N_NAMESPACES.RESPONSE_MESSAGE])
			.catch((error) => {
				logger.error('Failed to load namespaces', error);
			});

		const serverData = await serverLoader<typeof loader>();

		// If server detected no session, it sent headers to clear httpOnly cookies
		// The headers are already set in the response, so we just proceed
		if (serverData.status === 'NOT_AUTHENTICATED') {
			// The server has already cleared any httpOnly cookies
			// Just ensure client-side cookies are also cleared
			clearSessionCookie();
			return null;
		}

		if (serverData.status === 'HAS_AUTH_TOKEN') {
			// CRITICAL: Detect httpOnly cookie mismatch
			// If server can see a cookie but JavaScript cannot, it means there's an httpOnly cookie
			// In this case, we should NOT redirect away from login page, as this would cause
			// an infinite loop: login → authed (no JS cookie) → login → repeat
			const { getSessionCookieFromClient } = await import(
				'@/front/lib/cookies/session-cookie.utils'
			);
			const clientCanSeeToken = getSessionCookieFromClient();

			if (!clientCanSeeToken) {
				// httpOnly cookie detected! Server sees it but JS doesn't
				// Reload with a special query parameter to trigger server-side cookie clearing
				logger.warn(
					'Detected httpOnly session cookie mismatch. Reloading to clear httpOnly cookie.',
				);
				clearSessionCookie();

				// Hard reload with query parameter to trigger server-side clear
				const reloadUrl = new URL(window.location.href);
				reloadUrl.searchParams.set(queryParamKey.clear_http_only, 'true');
				window.location.href = reloadUrl.toString();

				// Return null while reloading
				return null;
			}

			// Normal flow: both server and client can see the token
			const resultsArray = await Promise.all([
				serverData.userAuthDataPromise,
				serverData.redirectCodePromise,
			]);

			if (_.some(resultsArray, (result) => result.status === 'error')) {
				const errors = resultsArray.filter(
					(result) => result.status === 'error',
				);

				if (
					_.some(
						errors,
						(error) =>
							_.toLower(error.error.message) === _.toLower('Unauthorized'),
					)
				) {
					// Clear session token cookie with all possible combinations
					// This handles cases where old httpOnly cookies might exist
					clearSessionCookie();

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
