import Parse from 'parse';
import { lazy, Suspense } from 'react';

import { Box } from '@mui/material';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { defer, Navigate, Outlet, redirect, useRevalidator, useRouteError, type RouteObject } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';

import ErrorDisplay from '@/office/components/ErrorDisplay';
import RevalidateButton from '@/office/components/RevalidateButton';
import SplashScreen from '@/office/components/SplashScreen';
import LoginPage from '@/office/modules/common/auth/login/Login';
import PortalPage from '@/office/modules/common/auth/portal/Portal';
import { BO_PATH_NAMES, SESSION_TOKEN_LOCAL_STORAGE_KEY } from '@/shared/lib/constants';
import { getIsDisabledSignupQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';
import { localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

import { getLastPath, getRouteLoader } from '../utils';

const Portal = lazy(() => {
	return import('@/office/modules/common/auth/portal/Portal');
});
const AuthLayout = lazy(() => {
	return import('@/office/layouts/auth/AuthLayout');
});
const Login = lazy(() => {
	return import('@/office/modules/common/auth/login/Login');
});
const Signup = lazy(() => {
	return import('@/office/modules/common/auth/signup/Signup');
});
const VerifyEmail = lazy(() => {
	return import('@/office/modules/common/auth/verify-email/VerifyEmail');
});

const PublicRootError = () => {
	const error = useRouteError();
	const { state } = useRevalidator();

	if (state === 'loading') {
		return <SplashScreen />;
	}

	if (error instanceof ParseRestError) {
		if (error.code === Parse.Error.INVALID_SESSION_TOKEN) {
			localStorageUnsetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY);
			parseApi.parseRestClient.setSessionToken(undefined);

			const searchParams = new URLSearchParams({
				[LoginPage.queryParamKeys.redirectCause]: LoginPage.redirectCause.INVALID_SESSION,
			});

			return <Navigate to={`${BO_PATH_NAMES.auth.login}?${decodeURIComponent(searchParams.toString())}`} />;
		}
	}

	return (
		<Box sx={{ p: 3 }}>
			<ErrorDisplay error={error} title="Something went wrong!! (PUBLIC)" />
			<RevalidateButton />
		</Box>
	);
};

const RootElement = () => {
	return <Portal />;
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
				// path: '/',
				index: true,
				loader: PortalPage.loader,
				// loader: getRouteLoader(async () => {
				// 	const sessionToken = parseApi.parseRestClient.getSessionToken();

				// 	if (!sessionToken) {
				// 		return redirect(BO_PATH_NAMES.auth.login);
				// 	}

				// 	const lastUsedTenantId = localStorageGetItem(LAST_USED_TENANT_ID_STORAGE_KEY);

				// 	const authDataQuery = getUserAuthDataQuery({ tenantId: lastUsedTenantId });
				// 	const cachedAuthData = defaultQueryClient.getQueryData(authDataQuery.queryKey);

				// 	const authData = cachedAuthData
				// 		? Promise.resolve(cachedAuthData)
				// 		: defaultQueryClient.fetchQuery(authDataQuery);

				// 	return defer({
				// 		authData,
				// 	});
				// }),
				element: <RootElement />,
			},
			// auth routes
			{
				path: getLastPath(BO_PATH_NAMES.auth.root),
				loader: getRouteLoader(async () => {
					const sessionToken = parseApi.parseRestClient.getSessionToken();

					if (sessionToken) {
						return redirect(BO_PATH_NAMES.staff.root); // todo: tenant aware redirection
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
			// {
			// 	path: '*',
			// 	element: <NotFound />,
			// },
		],
	},
];
