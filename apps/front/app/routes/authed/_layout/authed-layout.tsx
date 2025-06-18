import { View500 } from '@/front/components/error';
import { SplashScreen } from '@/front/components/loading-screen';
import type { SettingsState } from '@/front/components/settings';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import {
	SIDEBAR_COOKIE_MAX_AGE,
	SIDEBAR_COOKIE_NAME,
} from '@/front/lib/constants';
import {
	useGetTenantAuthData,
	useGetUserAuthData,
} from '@/front/lib/react-query/features/auth/auth.hooks';
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { useMainStore } from '@/front/lib/zustand/store';
import {
	FRONT_PATH_NAMES,
	SESSION_TOKEN_COOKIE_KEY,
} from '@/shared/lib/constants';
import { useSuspenseQueries } from '@tanstack/react-query';
import * as cookie from 'cookie';
import _ from 'lodash';
import { defaultApiClient } from 'packages/api/ApiClient';
import { type ReactNode, Suspense } from 'react';
import { Outlet, redirect } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import type { Route } from './+types/authed-layout';

export const clientLoader = getClientLoader({
	loader: async (_args: Route.ClientLoaderArgs) => {
		const browserCookies = cookie.parse(document.cookie);

		let sessionToken = _.get(browserCookies, SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			throw redirect(FRONT_PATH_NAMES.auth.login); // redirect to login
		}

		sessionToken = decodeURIComponent(sessionToken);

		defaultApiClient.parseRestClient.setSessionToken(sessionToken);

		const sideBarCookie = _.get(browserCookies, SIDEBAR_COOKIE_NAME);

		// set zustand state
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

		return {};
	},
});

export const ErrorBoundary = (_: Route.ErrorBoundaryProps) => {
	return <View500 />;
};

const AuthQueriesGuard = ({ children }: { children: ReactNode }) => {
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
