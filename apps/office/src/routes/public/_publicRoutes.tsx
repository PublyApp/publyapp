import { lazy, Suspense } from 'react';

import { Box } from '@mui/material';
import { defer, Outlet, redirect, useRouteError, type RouteObject } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';

import ErrorDisplay from '@/office/components/ErrorDisplay';
import SplashScreen from '@/office/components/SplashScreen';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { getIsDisabledSignupQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

import { getLastPath, getRouteLoader } from '../utils';

const AuthLayout = lazy(() => {
	return import('@/office/layouts/auth/AuthLayout');
});
const Login = lazy(() => {
	return import('@/office/modules/auth/login/Login');
});
const Signup = lazy(() => {
	return import('@/office/modules/auth/signup/Signup');
});
const VerifyEmail = lazy(() => {
	return import('@/office/modules/auth/verify-email/VerifyEmail');
});

const PublicRootError = () => {
	const error = useRouteError();

	return (
		<Box sx={{ p: 3 }}>
			<ErrorDisplay error={error as never} title="Something went wrong!! (Dash)" />
		</Box>
	);
};

export const publicRoutes: RouteObject[] = [
	{
		element: (
			<Suspense fallback={<SplashScreen />}>
				<Outlet />
			</Suspense>
		),
		errorElement: <PublicRootError />,
		children: [
			{
				path: '/',
				// if a session token exists, redirect to dashboard, else redirect to login page
				loader: getRouteLoader(async () => {
					const sessionToken = parseApi.parseRestClient.getSessionToken();

					if (sessionToken) {
						return redirect(BO_PATH_NAMES.dashboard.root);
					}

					return redirect(BO_PATH_NAMES.auth.login);
				}),
			},
			// auth routes
			{
				path: getLastPath(BO_PATH_NAMES.auth.root),
				loader: getRouteLoader(async () => {
					const sessionToken = parseApi.parseRestClient.getSessionToken();

					if (sessionToken) {
						return redirect(BO_PATH_NAMES.dashboard.root);
					}

					return null;
				}),
				element: <AuthLayout />,
				children: [
					{
						path: getLastPath(BO_PATH_NAMES.auth.login),
						element: <Login />,
						index: true,
					},
					{
						path: getLastPath(BO_PATH_NAMES.auth.signup),
						loader: getRouteLoader(async () => {
							const cachedSignupConfigData = defaultQueryClient.getQueryData(getIsDisabledSignupQuery.queryKey);

							const signupConfigData = cachedSignupConfigData
								? Promise.resolve(cachedSignupConfigData)
								: defaultQueryClient.fetchQuery(getIsDisabledSignupQuery);

							return defer({
								signupConfigData,
							});
						}),
						element: <Signup />,
					},
					{ path: getLastPath(BO_PATH_NAMES.auth.verifyEmail), element: <VerifyEmail /> },
				],
			},
		],
	},
];
