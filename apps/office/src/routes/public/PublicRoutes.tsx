import Parse from 'parse';
import { lazy, Suspense } from 'react';

import { Box } from '@mui/material';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { Navigate, Outlet, redirect, useRouteError, type RouteObject } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';

import ErrorDisplay from '@/office/components/ErrorDisplay';
import SplashScreen from '@/office/components/SplashScreen';
import { LoginRoute } from '@/office/modules/common/auth/login/LoginPage';
import { PortalRoute } from '@/office/modules/common/auth/portal/PortalPage';
import { SignupRoute } from '@/office/modules/common/auth/signup/SignupPage';
import { BO_PATH_NAMES, SESSION_TOKEN_LOCAL_STORAGE_KEY } from '@/shared/lib/constants';
import { localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

import { getLastPath, getRouteLoader } from '../utils';

const PortalPage = lazy(() => {
	return import('@/office/modules/common/auth/portal/PortalPage');
});
const AuthLayout = lazy(() => {
	return import('@/office/layouts/auth/AuthLayout');
});
const LoginPage = lazy(() => {
	return import('@/office/modules/common/auth/login/LoginPage');
});
const SignupPage = lazy(() => {
	return import('@/office/modules/common/auth/signup/SignupPage');
});
const VerifyEmailPage = lazy(() => {
	return import('@/office/modules/common/auth/verify-email/VerifyEmailPage');
});

const PublicRootError = () => {
	const error = useRouteError();

	if (error instanceof ParseRestError) {
		if (error.code === Parse.Error.INVALID_SESSION_TOKEN) {
			localStorageUnsetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY);
			parseApi.parseRestClient.setSessionToken(undefined);

			const searchParams = new URLSearchParams({
				[LoginRoute.queryParamKeys.redirectCause]: LoginRoute.redirectCause.INVALID_SESSION,
			});

			return <Navigate to={`${BO_PATH_NAMES.auth.login}?${decodeURIComponent(searchParams.toString())}`} />;
		}
	}

	return (
		<Box sx={{ p: 3 }}>
			<ErrorDisplay error={error} title="Something went wrong!! (PUBLIC)" />
		</Box>
	);
};

const authRoutesLoader = getRouteLoader(async () => {
	const sessionToken = parseApi.parseRestClient.getSessionToken();

	if (sessionToken) {
		return redirect(BO_PATH_NAMES.portal); // todo: verify
	}

	return null;
});

export const publicRoutes: RouteObject[] = [
	{
		errorElement: <PublicRootError />,
		element: (
			<Suspense fallback={<SplashScreen />}>
				<Outlet />
			</Suspense>
		),
		children: [
			// Route for determining if there is an authed user or not
			{
				index: true,
				loader: PortalRoute.Loader,
				element: <PortalPage />,
			},

			// auth routes
			{
				path: getLastPath(BO_PATH_NAMES.auth.root),
				loader: authRoutesLoader,
				element: <AuthLayout />,
				children: [
					{
						path: getLastPath(BO_PATH_NAMES.auth.login),
						element: <LoginPage />,
						index: true,
					},
					{
						path: getLastPath(BO_PATH_NAMES.auth.signup),
						loader: SignupRoute.loader,
						element: <SignupPage />,
					},
					{
						// for sending an email verification request
						path: getLastPath(BO_PATH_NAMES.auth.verifyEmail),
						element: <VerifyEmailPage />,
					},
					// todo: forgotten password
				],
			},
		],
	},
];
