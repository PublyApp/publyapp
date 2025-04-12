import type { ReactNode } from 'react';

import { useSuspenseQueries } from '@tanstack/react-query';
import { defaultApiClient } from 'packages/api/ApiClient';
import type { ErrorBoundaryProps } from 'react-error-boundary';
import { Outlet, redirect } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';

import { View500 } from '@/front/components/error';
import { SplashScreen } from '@/front/components/loading-screen';
import QuerySuspenseBoundary from '@/front/components/QuerySuspenseBoundary';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { CookieManager } from '@/front/lib/cookie-manager';
import {
	getTenantAuthDataQuery,
	getUserAuthDataQuery,
} from '@/front/lib/react-query/features/auth/auth.actions';
import { getClientLoader } from '@/front/lib/react-router/client.data';
import {
	FRONT_PATH_NAMES,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';

import type { Route } from './+types/AuthedLayout';

export const clientLoader = getClientLoader({
	loader: async (_args: Route.ClientLoaderArgs) => {
		const browserCookies = new CookieManager();
		const sessionToken = browserCookies.get(SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			throw redirect(FRONT_PATH_NAMES.auth.login); // redirect to login
		}

		defaultApiClient.parseRestClient.setSessionToken(sessionToken);

		// const cookies = new CookieManager();
		// const sideBarOpenCookie = cookies.get(SIDEBAR_COOKIE_NAME);

		// set zustand state
		// useMainStore.setState((root) => {
		// 	const allowedStates = ['expanded', 'collapsed'];

		// 	let state = _.toString(sideBarOpenCookie);

		// 	if (!allowedStates.includes(state)) {
		// 		state = allowedStates[0];
		// 		cookies.set(SIDEBAR_COOKIE_NAME, state);
		// 	}

		//
		// 	root.settingsSlice.sidebar.state = state as never;
		// });

		return {};
	},
});

const AuthQueriesGuard = ({ children }: { children: ReactNode }) => {
	const tenantId = useTenantParam();

	// trigger the queries in parallel
	useSuspenseQueries({
		queries: [getUserAuthDataQuery(), getTenantAuthDataQuery({ tenantId })],
	});

	return <>{children}</>;
};

const ErrorBoundary: ErrorBoundaryProps['FallbackComponent'] = () => {
	return <View500 />;
};

const AuthedLayout = ({ loaderData: _l }: Route.ComponentProps) => {
	return (
		<ClientOnly>
			{() => {
				return (
					<QuerySuspenseBoundary
						suspenseFallback={<SplashScreen />}
						FallbackComponent={ErrorBoundary}
					>
						<AuthQueriesGuard>
							<Outlet />
						</AuthQueriesGuard>
					</QuerySuspenseBoundary>
				);
			}}
		</ClientOnly>
	);
};

export default AuthedLayout;
