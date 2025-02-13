import type { ReactNode } from 'react';

import { useSuspenseQueries } from '@tanstack/react-query';
import { defaultApiClient } from 'packages/api/ApiClient';
import type { ErrorBoundaryProps } from 'react-error-boundary';
import { Outlet, redirect } from 'react-router';

import QueryBoundary from '@/front/components/QueryBoundary';
import { Button } from '@/front/components/tremor/Button';
import DashboardLayout from '@/front/components/ui/layout/dashboardLayout';
import { useTenantParam } from '@/front/hooks/useTenantParam';
import { getTenantAuthDataQuery, getUserAuthDataQuery } from '@/front/lib/react-query/features/auth/auth.actions';
import { getBrowserCookie } from '@/front/utils/web.utils';
import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';

import type { Route } from './+types/AuthedPagesLayout';

export const clientLoader = async () => {
	const sessionToken = getBrowserCookie(SESSION_TOKEN_COOKIE_KEY);

	if (!sessionToken) {
		return redirect('/login') as never; // redirect to login
	}

	defaultApiClient.parseRestClient.setSessionToken(sessionToken);

	return {}; // return empty data
};

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

const AuthedPagesLayout = ({ loaderData: _l }: Route.ComponentProps) => {
	const suspenseFallback = <h1>Auth loading, please wait....</h1>;
	return (
		<QueryBoundary FallbackComponent={FallbackComponent} suspenseFallback={suspenseFallback}>
			<AuthQueriesGuard>
				<DashboardLayout>
					<Outlet />
				</DashboardLayout>
			</AuthQueriesGuard>
		</QueryBoundary>
	);
};

export default AuthedPagesLayout;
