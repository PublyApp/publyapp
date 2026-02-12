import { useSuspenseQueries } from '@tanstack/react-query';
import * as cookie from 'cookie';
import i18next from 'i18next';
import _ from 'lodash';
import { type ReactNode, Suspense, useEffect } from 'react';
import { Outlet, redirect } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';

import {
	NotFoundView,
	View403,
	View500,
	ViewTenantSuspended,
} from '@/front/components/error';
import { SplashScreen } from '@/front/components/loading-screen';
import type { SettingsState } from '@/front/components/settings';
import { toast } from '@/front/components/snackbar';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { toApiFailure } from '@/front/lib/api-failure';
import {
	SIDEBAR_COOKIE_MAX_AGE,
	SIDEBAR_COOKIE_NAME,
} from '@/front/lib/constants';
import { getSessionCookieFromClient, logout } from '@/front/lib/cookies';
import { resetLogoutFlag } from '@/front/lib/cookies/logout.utils';
import { getSessionTokensFromClient } from '@/front/lib/cookies/session-cookie.utils';
import { getClientManager } from '@/front/lib/js-client/client-manager';
import {
	useGetTenantAuthData,
	useGetUserAuthData,
} from '@/front/lib/react-query/features/common/auth.hooks';
import {
	resetAuthLogoutFlag,
	resetTenantSuspendedFlag,
	setCurrentUserIdForTenantHint,
} from '@/front/lib/react-query/query-client';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { useMainStore } from '@/front/lib/zustand/store';
import {
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
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

		const sessionToken = getSessionCookieFromClient();

		if (!sessionToken) {
			// Full cleanup: clear JS cookies, query cache, API clients,
			// and start the httpOnly cookie clearing fetch in the background.
			logout({
				redirectCause:
					queryParamValue.login_page.redirect_cause.invalid_session,
			});
			// Redirect synchronously so the authed layout never renders.
			// Without this, the component shows SplashScreen while
			// logout's async navigation (fetch → finally → globalNavigate)
			// races with React Router's transition — which can hang
			// the splash screen indefinitely. The background fetch from
			// logout() still completes and clears any httpOnly cookies.
			const loginUrl = new URL(
				FRONT_PATH_NAMES.auth.login,
				window.location.origin,
			);
			loginUrl.searchParams.set(
				queryParamKey.login_page.redirect_cause,
				queryParamValue.login_page.redirect_cause.invalid_session,
			);
			return redirect(loginUrl.pathname + loginUrl.search);
		}

		// Guard against cross-scope navigation (tenant user on /staff, staff user on /app).
		// Prefer cookie prefixes when available (s:/t:), but fall back to GetRedirectCode for
		// legacy cookies (raw token) to avoid redirect loops.
		const { staffToken, tenantToken } = getSessionTokensFromClient();
		const pathname = new URL(_args.request.url).pathname;
		const isStaffPath = pathname.startsWith(FRONT_PATH_NAMES.staff.root);
		const isTenantPath = pathname.startsWith(FRONT_PATH_NAMES.tenant().root);

		if (isStaffPath && !staffToken && tenantToken) {
			try {
				const result = await getClientManager()
					.createClient()
					.auth.redirectCode.get();
				const redirectCode = result?.redirectCode;

				// Only redirect away from /staff if we can positively identify the user as NOT staff.
				if (redirectCode && redirectCode !== REDIRECT_CODE.STAFF) {
					return redirect(FRONT_PATH_NAMES.tenant().root);
				}
			} catch {
				// No redirect on error (avoid locking users into a loop)
			}
		}

		// Fast-path when cookie clearly indicates staff context (s:... present).
		if (isTenantPath && !tenantToken && staffToken) {
			return redirect(FRONT_PATH_NAMES.staff.root);
		}

		// Legacy staff cookies are stored as tenantToken only; detect staff via redirectCode.
		if (isTenantPath && tenantToken && !staffToken) {
			try {
				const result = await getClientManager()
					.createClient()
					.auth.redirectCode.get();
				const redirectCode = result?.redirectCode;
				if (redirectCode === REDIRECT_CODE.STAFF) {
					return redirect(FRONT_PATH_NAMES.staff.root);
				}
			} catch {
				// No redirect on error (fall back to normal page behavior, possibly 403)
			}
		}

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
	const queries = [useGetUserAuthData.getOptions({})];

	if (tenantId) {
		queries.push(useGetTenantAuthData.getOptions({ tenantId }));
	}

	// trigger the queries in parallel
	const results = useSuspenseQueries({ queries });

	// Extract user ID from auth data for tenant-suspended handling
	const userAuthData = results[0]?.data as { id?: string } | undefined;
	const userId = userAuthData?.id;

	// Session is valid - reset all logout/auth flags on mount
	// This ensures flags don't stay stuck after SPA navigation (no page reload)
	// Using useEffect to avoid side-effects during render (React StrictMode safe)
	useEffect(() => {
		resetAuthLogoutFlag();
		resetTenantSuspendedFlag();
		resetLogoutFlag();
	}, []);

	// Set current user ID for tenant hint management (tenant-suspended handling)
	// This needs to run after auth data is loaded so the global handler can clear the hint
	useEffect(() => {
		if (userId) {
			setCurrentUserIdForTenantHint(userId);
		}
	}, [userId]);

	// Show toast when redirected with org-suspended notice
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (
			params.get(queryParamKey.notice) === queryParamValue.notice.org_suspended
		) {
			toast.warning(i18next.t('suspended-tenants-notice', { ns: 'common' }));
			// Clean up the query param from URL
			params.delete(queryParamKey.notice);
			const newUrl =
				params.size > 0
					? `${window.location.pathname}?${params}`
					: window.location.pathname;
			window.history.replaceState({}, '', newUrl);
		}
	}, []);

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
		logout({
			redirectCause: queryParamValue.login_page.redirect_cause.invalid_session,
		});

		return <SplashScreen />;
	}

	return <AuthQueriesLoader>{children}</AuthQueriesLoader>;
};

const AuthedLayout = () => {
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
	const failure = toApiFailure(error);

	// Handle specific status codes for problem failures
	if (failure.kind === 'problem') {
		// Handle 401 Unauthorized - session expired or invalid
		// Global handler in query-client already triggers logout, but we show SplashScreen
		// for clean UX during redirect
		if (failure.status === 401) {
			// Trigger logout (may be redundant if global handler already fired, but safe)
			logout({
				redirectCause:
					queryParamValue.login_page.redirect_cause.invalid_session,
			});
			return <SplashScreen />;
		}

		// Handle 403 tenant-suspended - show dedicated page
		if (
			failure.status === 403 &&
			failure.translationKey === 'tenant-suspended'
		) {
			return <ViewTenantSuspended />;
		}

		// Handle 403 Forbidden - user doesn't have access (no logout!)
		if (failure.status === 403) {
			return <View403 />;
		}

		// Handle 404 Not found
		if (failure.status === 404) {
			return <NotFoundView />;
		}
	}

	// Network errors
	if (failure.kind === 'network') {
		return <View500 />;
	}

	// if (import.meta.env.DEV) {
	// 	return <TemplateErrorBoundary error={error} />;
	// }

	// else, show the error 500 page
	return <View500 />;
};
