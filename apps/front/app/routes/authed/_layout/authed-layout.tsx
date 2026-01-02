import { useSuspenseQueries } from '@tanstack/react-query';
import * as cookie from 'cookie';
import i18next from 'i18next';
import _ from 'lodash';
import { type ReactNode, Suspense } from 'react';
import { Outlet } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';

import { NotFoundView, View403, View500 } from '@/front/components/error';
import { SplashScreen } from '@/front/components/loading-screen';
import type { SettingsState } from '@/front/components/settings';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { initApiClientOnClient } from '@/front/lib/api';
import {
	SIDEBAR_COOKIE_MAX_AGE,
	SIDEBAR_COOKIE_NAME,
} from '@/front/lib/constants';
import { getSessionCookieFromClient, logout } from '@/front/lib/cookies';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useGetTenantAuthData,
	useGetUserAuthData,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { getClientLoader } from '@/front/lib/react-router/client-data';
// import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { useMainStore } from '@/front/lib/zustand/store';
import { I18N_NAMESPACES } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

import type { Route } from './+types/authed-layout';

// export const loader = getServerLoader({
// 	loader: async () => {
// 		return null;
// 	},
// });

export const clientLoader = getClientLoader({
	loader: async (_args: Route.ClientLoaderArgs) => {
		i18next
			.loadNamespaces([I18N_NAMESPACES.ZOD, I18N_NAMESPACES.RESPONSE_MESSAGE])
			.catch((error) => {
				logger.error('Failed to load namespaces', error);
			});

		const sessionToken = getSessionCookieFromClient();

		if (!sessionToken) {
			// No session token readable by JavaScript
			// Submit form to clear any httpOnly cookie and redirect to login
			logout({ redirectCause: 'invalid_session' });
			// Return null while form is submitting (navigation will take over)
			return null;
		}

		initApiClientOnClient();

		const browserCookies = cookie.parse(document.cookie);
		const sideBarCookie = _.get(browserCookies, SIDEBAR_COOKIE_NAME);

		// Initialize zustand navLayout state
		useMainStore.setState((root) => {
			const allowedStates: Exclude<SettingsState['navLayout'], undefined>[] = [
				'vertical',
				'mini',
				'horizontal',
			];

			let state = _.toString(sideBarCookie);

			if (!allowedStates.includes(state as never)) {
				state = allowedStates[0];
				const newCookie = cookie.serialize(SIDEBAR_COOKIE_NAME, state, {
					path: '/',
					maxAge: SIDEBAR_COOKIE_MAX_AGE,
				});
				document.cookie = newCookie;
			}

			root.settingsSlice.state.navLayout = state as never;
		});

		return null;
	},
});

const AuthQueriesLoader = ({ children }: { children: ReactNode }) => {
	const tenantId = useTenantParam();

	// Build queries array - only include tenant auth if we have a tenantId
	const queries = [useGetUserAuthData.getOptions()];

	if (tenantId) {
		queries.push(useGetTenantAuthData.getOptions({ tenantId }));
	}

	// trigger the queries in parallel
	useSuspenseQueries({ queries });

	return <>{children}</>;
};

const AuthQueriesGuard = ({ children }: { children: ReactNode }) => {
	// Check if session token exists before running queries
	// This should rarely trigger since clientLoader already checks
	// But it's a safety net in case of race conditions
	const sessionToken = getSessionCookieFromClient();

	if (!sessionToken) {
		// No session token - this is a safety check
		// Submit form to clear any httpOnly cookie and redirect to login
		logout({ redirectCause: 'invalid_session' });

		return <SplashScreen />;
	}

	return <AuthQueriesLoader>{children}</AuthQueriesLoader>;
};

const AuthedLayout = ({ loaderData: _l }: Route.ComponentProps) => {
	return (
		<ClientOnly>
			{() => {
				return (
					<Suspense fallback={<SplashScreen />}>
						<AuthQueriesGuard>
							<Outlet />
						</AuthQueriesGuard>
					</Suspense>
				);
			}}
		</ClientOnly>
	);
};

export default AuthedLayout;

export const HydrateFallback = () => {
	return <SplashScreen />;
};

export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	// Handle 401 Unauthorized - session expired or invalid
	if (
		isJsClientError(error) &&
		error.responseStatusCode === 401 &&
		_.toLower(error.messageEscaped) === _.toLower('Unauthorized')
	) {
		// Clear session and submit form to clear any httpOnly cookie
		logout({ redirectCause: 'invalid_session' });
		return <SplashScreen />;
	}

	// Handle 403 Forbidden - user doesn't have access to the tenant
	if (isJsClientError(error) && error.responseStatusCode === 403) {
		return <View403 />;
	}

	// handle 404 Not found error
	if (isJsClientError(error) && error.responseStatusCode === 404) {
		return <NotFoundView />;
	}

	// if (import.meta.env.DEV) {
	// 	return <TemplateErrorBoundary error={error} />;
	// }

	// else, show the error 500 page
	return <View500 />;
};
