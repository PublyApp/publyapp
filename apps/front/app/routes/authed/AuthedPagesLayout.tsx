import { Suspense } from 'react';

import { defaultApiClient } from 'packages/api/ApiClient';
import { Outlet, redirect } from 'react-router';

import { useGetTenantAuthData, useGetUserAuthData } from '@/front/lib/react-query/features/auth/auth.hooks';
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

const AuthedPagesLayout = ({ loaderData: _l }: Route.ComponentProps) => {
	return (
		<Suspense fallback={<div>Loading check session...</div>}>
			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
			<AuthGuard />
		</Suspense>
	);
};

export default AuthedPagesLayout;

const AuthGuard = () => {
	useGetUserAuthData();
	useGetTenantAuthData();

	return <Outlet />;
};
