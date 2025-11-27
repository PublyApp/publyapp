import { useSuspenseQueries } from '@tanstack/react-query';
import * as cookie from 'cookie';
import i18next from 'i18next';
import _ from 'lodash';
import { type ReactNode, Suspense } from 'react';
import { Outlet, redirect } from 'react-router';
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
import {
	clearSessionCookie,
	createClearSessionCookieHeaders,
	getSessionCookieFromClient,
} from '@/front/lib/cookies';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useGetTenantAuthData,
	useGetUserAuthData,
} from '@/front/lib/react-query/features/common/auth.hooks';
import { defaultQueryClient } from '@/front/lib/react-query/query-client';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
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

/**
 * Clears session state (cookies and query cache) and returns the login redirect URL.
 * This consolidates the cleanup logic used across clientLoader, ErrorBoundary, and AuthQueriesGuard.
 *
 * @returns URL string for redirecting to login with invalid_session cause
 */
const clearSessionAndGetLoginUrl = (): string => {
	// Clear session cookie (non-httpOnly only - httpOnly cookies require server-side clearing)
	clearSessionCookie();

	// Clear react-query cache
	defaultQueryClient.removeQueries();

	// Build login redirect URL with invalid_session cause
	const redirectUrl = new URL(
		FRONT_PATH_NAMES.auth.login,
		window.location.origin,
	);
	redirectUrl.searchParams.set(
		queryParamKey.login_page.redirect_cause,
		queryParamValue.login_page.redirect_cause.invalid_session,
	);

	return redirectUrl.pathname + redirectUrl.search;
};

export const loader = getServerLoader({
	loader: async ({ request }) => {
		const url = new URL(request.url);
		const forceHttpOnlyClear =
			url.searchParams.get(queryParamKey.clear_http_only) === 'true';

		const reqCookies = cookie.parse(request.headers.get('cookie') || '');
		const sessionToken = _.get(reqCookies, SESSION_TOKEN_COOKIE_KEY);

		// Handle httpOnly cookie clearing (only when parameter is present AND there's a session token)
		// This indicates JavaScript couldn't read the cookie (httpOnly mismatch)
		if (forceHttpOnlyClear && sessionToken) {
			// Clear the httpOnly cookie and redirect to login
			const clearHeaders = createClearSessionCookieHeaders();

			const loginUrl = new URL(FRONT_PATH_NAMES.auth.login, url.origin);
			loginUrl.searchParams.set(
				queryParamKey.login_page.redirect_cause,
				queryParamValue.login_page.redirect_cause.invalid_session,
			);

			return redirect(loginUrl.pathname + loginUrl.search, {
				headers: clearHeaders,
			});
		}

		return null;
	},
});

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
			// Clear session and redirect to login
			// The auth-layout will detect any httpOnly cookie mismatch and prevent infinite loops
			throw redirect(clearSessionAndGetLoginUrl());
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
		// Clear session and get login URL
		// The auth-layout will handle any httpOnly cookie issues
		const loginUrl = clearSessionAndGetLoginUrl();

		logger.debug('Redirecting to login page', { url: loginUrl });

		// Use hard redirect to ensure clean break from error state
		window.location.href = loginUrl;

		return <SplashScreen />;
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
	// This should rarely trigger since clientLoader already checks
	// But it's a safety net in case of race conditions
	const sessionToken = getSessionCookieFromClient();

	if (!sessionToken) {
		// No session token - this is a safety check
		// Clear session and redirect to login
		// The auth-layout will handle any httpOnly cookie issues
		window.location.href = clearSessionAndGetLoginUrl();

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
