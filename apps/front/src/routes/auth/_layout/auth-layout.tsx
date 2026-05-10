import i18next from 'i18next';
import first from 'lodash/first';
import some from 'lodash/some';
import toLower from 'lodash/toLower';
import { Suspense } from 'react';
import { isRouteErrorResponse, Outlet, redirect } from 'react-router';

import {
	formActionKey,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	REDIRECT_CODE,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { View401 } from '#app/components/error/401-view.tsx';
import { View403 } from '#app/components/error/403-view.tsx';
import { View404 } from '#app/components/error/404-view.tsx';
import { View500 } from '#app/components/error/500-view.tsx';
import { GenericErrorView } from '#app/components/error/generic-error-view.tsx';
import { SplashScreen } from '#app/components/loading-screen/splash-screen.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { AuthSplitLayout } from '#app/layouts/auth-split/layout.tsx';
import { toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	clearSessionCookie,
	getSessionCookieFromClient,
} from '#app/lib/cookies/session-cookie.utils.ts';
import { readTenantHintsFromRequestHeaders } from '#app/lib/cookies/tenant-hint-cookie.utils.ts';
import { getClientManager } from '#app/lib/js-client/client-manager.ts';
import { useGetUserAuthData } from '#app/lib/react-query/features/common/auth.hooks.ts';
import { getQueryClient } from '#app/lib/react-query/query-client.tsx';
import { getClientLoader } from '#app/lib/react-router/client-data.ts';
import { safeRun } from '#app/lib/react-router/safeRun.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/auth-layout';

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
	loader: async ({ serverLoader, request }) => {
		i18next
			.loadNamespaces([I18N_NAMESPACES.ZOD, I18N_NAMESPACES.RESPONSE_MESSAGE])
			.catch((error) => {
				logger.error('Failed to load namespaces', error);
			});

		const pathname = new URL(request.url).pathname;
		const isInvitationRoute =
			pathname === FRONT_PATH_NAMES.auth.acceptInvitation;

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

			if (some(resultsArray, (result) => result.status === 'error')) {
				const errors = resultsArray.filter(
					(result) => result.status === 'error',
				);

				if (
					some(
						errors,
						(error) => toLower(error.error.message) === toLower('Unauthorized'),
					)
				) {
					// Clear session token cookie with all possible combinations
					// This handles cases where old httpOnly cookies might exist
					clearSessionCookie();

					return null;
				}

				throw (
					first(errors)?.error ||
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

			if (isInvitationRoute) {
				return null;
			}

			if (redirectCode && redirectCode !== REDIRECT_CODE.UNAUTHORIZED) {
				if (redirectCode === REDIRECT_CODE.STAFF) {
					return redirect(FRONT_PATH_NAMES.staff.root);
				}

				if (redirectCode === REDIRECT_CODE.TENANT_PICKER) {
					// Multiple tenants, no valid hint - go to tenant portal/picker
					return redirect(FRONT_PATH_NAMES.tenant()._root);
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

// Dual-detection note (`routeStatus` AND `failure.status`): React Router wraps
// thrown Responses in an internal ErrorResponse class that is NOT
// `instanceof Response`, so toApiFailure() can't classify them as
// `kind: 'problem'`. The helpers split:
//   - `routeStatus`  → "the framework caught a thrown Response (loader/action)"
//   - `failure.kind` → "an API failure object reached the boundary"
// Both paths can produce, e.g., a 401, so each branch checks both. Don't
// collapse them into one — you'll silently miss either the synthetic-throw
// case (loaders that throw) or the API-bubble case (actual server 401).
export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	const failure = toApiFailure(error);
	const routeStatus = isRouteErrorResponse(error) ? error.status : undefined;

	// Route 404 (typo'd auth route, or a 404 thrown from an auth loader).
	if (routeStatus === 404) {
		return <View404 />;
	}

	// CRITICAL: a 401 in the auth surface does NOT trigger logout. The user
	// is not logged in to begin with — auth-surface 401s typically come from
	// expired URL-borne tokens (invitation, reset). Show the view + back-to-
	// login CTA. Contrast with authed-layout.tsx where 401 → logout.
	//
	// Detect both: a thrown Response(401) (caught by React Router as a route
	// error response) AND an API failure that surfaced a 401 from the loader.
	if (
		routeStatus === 401 ||
		(failure.kind === 'problem' && failure.status === 401)
	) {
		return <View401 />;
	}

	// 403 — login succeeded but the user has no scope they can access.
	// Thrown from login-page's action with the session cookie preserved on
	// responseHeaders. Replaces the previous /unauthorized standalone route.
	if (
		routeStatus === 403 ||
		(failure.kind === 'problem' && failure.status === 403)
	) {
		return <View403 />;
	}

	// Network failure (auth server unreachable). 5xx route responses also
	// surface here so the user gets a proper "server problem" view instead of
	// the generic fallback.
	if (
		failure.kind === 'network' ||
		(routeStatus !== undefined && routeStatus >= 500)
	) {
		return <View500 />;
	}

	// Render exception / unknown — generic with back-to-sign-in.
	return <GenericErrorView />;
};
