import { useSuspenseQueries } from '@tanstack/react-query';
import * as cookie from 'cookie';
import i18next from 'i18next';
import _ from 'lodash';
import { type ReactNode, Suspense } from 'react';
import { Outlet } from 'react-router';
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
	formActionKey,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	queryParamKey,
	queryParamValue,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

import type { Route } from './+types/authed-layout';

/**
 * Clears session state and submits a form to clear any httpOnly cookies server-side.
 * This ensures both JS-accessible and httpOnly cookies are cleared in one redirect.
 */
const clearSessionAndRedirectToLogin = (): void => {
	// Clear session cookie (non-httpOnly only)
	clearSessionCookie();

	// Clear react-query cache
	defaultQueryClient.removeQueries();

	// Submit form to clear-session route which will:
	// 1. Clear any httpOnly session cookie on the server
	// 2. Redirect to login page
	// POST + Origin validation on server prevents link-based logout attacks
	const form = document.createElement('form');
	form.method = 'POST';
	form.action = FRONT_PATH_NAMES.auth.clearSession;

	const actionInput = document.createElement('input');
	actionInput.type = 'hidden';
	actionInput.name = 'action';
	actionInput.value = formActionKey.clear_httponly_session;
	form.appendChild(actionInput);

	// Add redirect_cause so login page shows appropriate message
	const causeInput = document.createElement('input');
	causeInput.type = 'hidden';
	causeInput.name = queryParamKey.login_page.redirect_cause;
	causeInput.value = queryParamValue.login_page.redirect_cause.invalid_session;
	form.appendChild(causeInput);

	document.body.appendChild(form);
	form.submit();
};

export const loader = getServerLoader({
	loader: async () => {
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
			// Submit form to clear any httpOnly cookie and redirect to login
			clearSessionAndRedirectToLogin();
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

export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	if (
		isJsClientError(error) &&
		error.responseStatusCode === 401 &&
		_.toLower(error.messageEscaped) === _.toLower('Unauthorized')
	) {
		// Clear session and submit form to clear any httpOnly cookie
		clearSessionAndRedirectToLogin();
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
		// Submit form to clear any httpOnly cookie and redirect to login
		clearSessionAndRedirectToLogin();

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
