import type { ReactNode } from 'react';

import { createTheme, MantineProvider } from '@mantine/core';
import { useSuspenseQueries } from '@tanstack/react-query';
import { defaultApiClient } from 'packages/api/ApiClient';
import type { ErrorBoundaryProps } from 'react-error-boundary';
import { Outlet, redirect } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';

import QueryBoundary from '@/front/components/QueryBoundary';
import { Button } from '@/front/components/tremor/Button';
import { SIDEBAR_COOKIE_NAME } from '@/front/components/tremor/Sidebar';
import DashboardLayout from '@/front/components/ui/layout/DashboardLayout';
import { useTenantParam } from '@/front/hooks/useTenantParam';
import { CookieManager } from '@/front/lib/cookie-manager';
import { getTenantAuthDataQuery, getUserAuthDataQuery } from '@/front/lib/react-query/features/auth/auth.actions';
import { getClientLoader } from '@/front/lib/react-router/client.data';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

import type { Route } from './+types/AuthedPagesLayout';

const theme = createTheme({});

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

		return { defaultOpenSideBar: sideBarOpenCookie === 'true' };
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

const FallbackComponent: ErrorBoundaryProps['FallbackComponent'] = ({ error, resetErrorBoundary }) => {
	console.log('❌❌', error);
	return (
		<div>
			<h1>Oops! Something went wrong</h1>
			<Button
				onClick={() => {
					resetErrorBoundary();
				}}
			>
				retry
			</Button>
		</div>
	);
};

const suspenseFallback = <h1>Auth loading, please wait....</h1>;

const AuthedPagesLayout = ({ loaderData }: Route.ComponentProps) => {
	return (
		<ClientOnly>
			{() => {
				return (
					<QueryBoundary FallbackComponent={FallbackComponent} suspenseFallback={suspenseFallback}>
						<AuthQueriesGuard>
							<MantineProvider theme={theme}>
								<DashboardLayout defaultOpenSideBar={loaderData.defaultOpenSideBar}>
									<Outlet />
								</DashboardLayout>
							</MantineProvider>
						</AuthQueriesGuard>
					</QueryBoundary>
				);
			}}
		</ClientOnly>
	);
};

export default AuthedPagesLayout;
