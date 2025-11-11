import { useSuspenseQueries } from '@tanstack/react-query';
import * as cookie from 'cookie';
import i18next from 'i18next';
import _ from 'lodash';
import { type ReactNode, Suspense } from 'react';
import { Navigate, Outlet, redirect } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { View500 } from '@/front/components/error';
import { ErrorBoundary as TemplateErrorBoundary } from '@/front/components/error-boundary';
import { SplashScreen } from '@/front/components/loading-screen';
import type { SettingsState } from '@/front/components/settings';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { initApiClientOnClient } from '@/front/lib/api';
import {
	SIDEBAR_COOKIE_MAX_AGE,
	SIDEBAR_COOKIE_NAME,
} from '@/front/lib/constants';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useGetTenantAuthData,
	useGetUserAuthData,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { defaultQueryClient } from '@/front/lib/react-query/query-client';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { useMainStore } from '@/front/lib/zustand/store';
import {
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	queryParamKey,
	queryParamValue,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';
import type { Route } from './+types/authed-layout';

export const clientLoader = getClientLoader({
	loader: async (_args: Route.ClientLoaderArgs) => {
		i18next
			.loadNamespaces([I18N_NAMESPACES.ZOD, I18N_NAMESPACES.RESPONSE_MESSAGE])
			.catch((error) => {
				logger.error('Failed to load namespaces', error);
			});

		const browserCookies = cookie.parse(document.cookie);
		const sessionToken = _.get(browserCookies, SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			throw redirect(FRONT_PATH_NAMES.auth.login); // redirect to login
		}

		initApiClientOnClient();

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

export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	// check response error.body.code
	// if invalid session token, redirect to login
	// with a query param: redirectCause=invalid_session
	// don't forget to remove session token cookie
	// clear react-query cache too
	// const error = useRouteError();

	logger.debug('ErrorBoundary', { error });

	if (
		isJsClientError(error) &&
		error.responseStatusCode === 401 &&
		_.toLower(error.messageEscaped) === _.toLower('Unauthorized')
	) {
		// remove session token cookie
		document.cookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', {
			path: '/',
			expires: new Date(0),
			maxAge: 0,
		});

		// clear react-query cache too
		defaultQueryClient.removeQueries();

		// redirect to login page with a query param as redirect cause
		const url = new URL(FRONT_PATH_NAMES.auth.login, window.location.origin);
		url.searchParams.set(
			queryParamKey.login_page.redirect_cause,
			queryParamValue.login_page.redirect_cause.invalid_session,
		);

		logger.debug('Redirecting to login page', { url: url.toString() });

		return <Navigate to={url.pathname + url.search} replace />;
	}

	if (import.meta.env.DEV) {
		return <TemplateErrorBoundary error={error} />;
	}

	// else, show the error page
	return <View500 />;
};

const AuthQueriesLoader = ({ children }: { children: ReactNode }) => {
	const tenantId = useTenantParam();

	// trigger the queries in parallel
	useSuspenseQueries({
		queries: [
			useGetUserAuthData.getOptions(),
			useGetTenantAuthData.getOptions({ tenantId }),
		],
	});

	return <>{children}</>;
};

const AuthQueriesGuard = ({ children }: { children: ReactNode }) => {
	// Check if session token exists before running queries
	// This prevents infinite loop when ErrorBoundary clears the cookie
	const browserCookies = cookie.parse(document.cookie);
	const sessionToken = _.get(browserCookies, SESSION_TOKEN_COOKIE_KEY);

	if (!sessionToken) {
		// No session token, redirect to login
		const url = new URL(FRONT_PATH_NAMES.auth.login, window.location.origin);
		url.searchParams.set(
			queryParamKey.login_page.redirect_cause,
			queryParamValue.login_page.redirect_cause.invalid_session,
		);
		return <Navigate to={url.pathname + url.search} replace />;
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
