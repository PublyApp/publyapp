import i18next from 'i18next';
import _ from 'lodash';
import { Suspense } from 'react';
import { Outlet, redirect } from 'react-router';

import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { AuthSplitLayout } from '@/front/layouts/auth-split/layout';
import {
	clearSessionCookie,
	getSessionCookieFromClient,
} from '@/front/lib/cookies/session-cookie.utils';
import { readTenantHintsFromRequestHeaders } from '@/front/lib/cookies/tenant-hint-cookie.utils';
import { getClientManager } from '@/front/lib/js-client/client-manager';
import {
	useGetTenantAuthData,
	useGetUserAuthData,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { getQueryClient } from '@/front/lib/react-query/query-client';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import {
	FRONT_PATH_NAMES,
	formActionKey,
	I18N_NAMESPACES,
	REDIRECT_CODE,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

export const loader = getServerLoader({
	loader: async ({ request, sessionToken, staffToken, tenantToken }) => {
		// If no session token exists, return NOT_AUTHENTICATED
		// sessionToken is the primary token (tenantToken ?? staffToken) parsed by getServerLoader
		if (!sessionToken) {
			return {
				status: 'NOT_AUTHENTICATED',
			} as const;
		}

		// Session token exists - validate it by calling the API
		const authedApiClient = getClientManager({
			staffToken,
			tenantToken,
		}).createClient();

		const getUserAuthData = safeRun(async () => {
			return authedApiClient.auth.userAuthData.get();
		});

		// Read legacy tenant hint - identity-scoped lookup would require userId
		// which we don't have until userAuthData resolves. For auth-layout's
		// redirect-away case, legacy fallback is acceptable during migration.
		const { legacyTenantId } = readTenantHintsFromRequestHeaders(request);

		const getRedirectCode = safeRun(async () => {
			return authedApiClient.auth.redirectCode.get({
				queryParameters: { tenantId: legacyTenantId },
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

		// No session token visible to server - user is not authenticated
		if (serverData.status === 'NOT_AUTHENTICATED') {
			// Clear any JS-accessible cookies (if any exist) and proceed to render auth page
			clearSessionCookie();
			return null;
		}

		if (serverData.status === 'HAS_AUTH_TOKEN') {
			// CRITICAL: Detect httpOnly cookie mismatch
			// If server can see a cookie but JavaScript cannot, it means there's an httpOnly cookie
			// In this case, we should NOT redirect away from login page, as this would cause
			// an infinite loop: login → authed (no JS cookie) → login → repeat
			const clientCanSeeToken = getSessionCookieFromClient();

			if (!clientCanSeeToken) {
				// httpOnly cookie detected! Server sees it but JS doesn't
				// Submit a form to the dedicated clear-session route
				// POST + Origin validation prevents link-based logout attacks
				// Note: fetch() doesn't apply Set-Cookie headers, so we must use form submission
				logger.warn(
					'[auth-layout clientLoader] Detected httpOnly session cookie mismatch. Clearing via POST.',
				);
				clearSessionCookie();

				// Create and submit a real form - this ensures Set-Cookie headers are processed
				const form = document.createElement('form');
				form.method = 'POST';
				form.action = FRONT_PATH_NAMES.auth.clearSession;

				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = 'action';
				input.value = formActionKey.clear_httponly_session;
				form.appendChild(input);

				document.body.appendChild(form);
				form.submit();

				// Return null while form is submitting
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

			getQueryClient().setQueryData(useGetUserAuthData.getKey(), userAuthData);

			if (redirectCode && redirectCode !== REDIRECT_CODE.UNAUTHORIZED) {
				if (redirectCode === REDIRECT_CODE.STAFF) {
					return redirect(FRONT_PATH_NAMES.staff.root);
				}

				if (redirectCode === REDIRECT_CODE.TENANT_PICKER) {
					// Multiple tenants, no valid hint - go to tenant portal/picker
					// Don't prefetch tenant auth data (no specific tenant yet)
					return redirect(FRONT_PATH_NAMES.tenant()._root);
				}

				// redirectCode is a valid tenant ID - prefetch and redirect
				getQueryClient().prefetchQuery({
					queryKey: useGetTenantAuthData.getKey({ tenantId: redirectCode }),
					queryFn: () =>
						useGetTenantAuthData.fetcher({ tenantId: redirectCode }),
				});

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
