import _ from 'lodash';
import type { ReactNode } from 'react';

import { useSuspenseQueries } from '@tanstack/react-query';
import { defaultApiClient } from 'packages/api/ApiClient';
import { Outlet, redirect } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';

import DashboardLayout from '@/front/components/ui/layout/DashboardLayout';
import { useTenantParam } from '@/front/hooks/useTenantParam';
import { SIDEBAR_COOKIE_NAME } from '@/front/lib/constants';
import { CookieManager } from '@/front/lib/cookie-manager';
import { getTenantAuthDataQuery, getUserAuthDataQuery } from '@/front/lib/react-query/features/auth/auth.actions';
import { getClientLoader } from '@/front/lib/react-router/client.data';
import { useMainStore } from '@/front/lib/zustand/store';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

import type { Route } from './+types/AuthedPagesLayout';

export const clientLoader = getClientLoader({
	loader: async (_args: Route.ClientLoaderArgs) => {
		const browserCookies = new CookieManager();
		const sessionToken = browserCookies.get(SESSION_TOKEN_COOKIE_KEY);

		if (!sessionToken) {
			throw redirect('/login'); // redirect to login
		}

		defaultApiClient.parseRestClient.setSessionToken(sessionToken);

		const cookies = new CookieManager();
		const sideBarOpenCookie = cookies.get(SIDEBAR_COOKIE_NAME);

		// set zustand state
		useMainStore.setState((root) => {
			const allowedStates = ['expanded', 'collapsed'];

			let state = _.toString(sideBarOpenCookie);

			if (!allowedStates.includes(state)) {
				// eslint-disable-next-line prefer-destructuring
				state = allowedStates[0];
				cookies.set(SIDEBAR_COOKIE_NAME, state);
			}

			// eslint-disable-next-line no-param-reassign
			root.settingsSlice.sidebar.state = state as never;
		});

		return {};
	},
});

const AuthQueriesGuard = ({ children }: { children: ReactNode }) => {
	// trigger the queries in parallel
	const tenantId = useTenantParam();
	useSuspenseQueries({
		queries: [getUserAuthDataQuery(), getTenantAuthDataQuery({ tenantId })],
	});

	// eslint-disable-next-line react/jsx-no-useless-fragment
	return <>{children}</>;
};

const AuthedPagesLayout = ({ loaderData: _l }: Route.ComponentProps) => {
	return (
		<ClientOnly>
			{() => {
				return (
					<AuthQueriesGuard>
						<DashboardLayout>
							<Outlet />
						</DashboardLayout>
					</AuthQueriesGuard>
				);
			}}
		</ClientOnly>
	);
};

export default AuthedPagesLayout;
