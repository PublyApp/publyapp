import Parse from 'parse';
import { lazy, Suspense } from 'react';

import { Box, Button } from '@mui/material';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { defer, Navigate, Outlet, redirect, useRevalidator, useRouteError, type RouteObject } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';

import AuthGuard from '@/office/components/AuthGuard';
import ErrorDisplay from '@/office/components/ErrorDisplay';
// import LoadingScreen from '@/office/components/LoadingScreen';
import SplashScreen from '@/office/components/SplashScreen';
import TenantGuard from '@/office/components/TenantGuard';
import StaffDashLayout from '@/office/layouts/dashboard/staff/StaffDashLayout';
import TenantDashLayout from '@/office/layouts/dashboard/tenant/TenantDashLayout';
import Login from '@/office/modules/auth/login/Login';
import {
	BO_PATH_NAMES,
	LAST_USED_TENANT_ID_STORAGE_KEY,
	roleSet,
	SESSION_TOKEN_LOCAL_STORAGE_KEY,
} from '@/shared/lib/constants';
import { ClientException } from '@/ui-react/exceptions/ClientException';
import { getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';
import { localStorageGetItem, localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

import { getLastPath, getRouteLoader } from '../utils';

// const DashboardLayout = lazy(() => {
// 	return import('@/office/layouts/dashboard/_common/DashBoardLayout');
// });
// const Home = lazy(() => {
// 	return import('@/office/containers/home/Home');
// });
// const BlogSettings = lazy(() => {
// 	return import('@/office/modules/blog/settings/BlogSettings');
// });
// const FileManager = lazy(() => {
// 	return import('@/office/containers/fileManager/FileManager');
// });
const NotFound = lazy(() => {
	return import('@/office/components/NotFound');
});
// const NewPost = lazy(() => {
// 	return import('@/office/modules/blog/new-post/NewPost');
// });
// const PostsList = lazy(() => {
// 	return import('@/office/modules/blog/posts-list/PostsList');
// });
// const EditPost = lazy(() => {
// 	return import('@/office/modules/blog/edit-post/EditPost');
// });

const AuthedRoutesRootError = () => {
	const error = useRouteError();
	const { revalidate, state } = useRevalidator();

	if (state === 'loading') {
		return <SplashScreen />;
	}

	if (error instanceof ClientException) {
		if (error.code === ClientException.AUTH_REQUIRED) {
			return <Navigate to={BO_PATH_NAMES.auth.login} />;
		}
	}

	if (error instanceof ParseRestError) {
		if (error.code === Parse.Error.INVALID_SESSION_TOKEN) {
			localStorageUnsetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY);

			const searchParams = new URLSearchParams({
				[Login.queryParamKeys.redirectCause]: Login.redirectCause.INVALID_SESSION,
			});

			return <Navigate to={`${BO_PATH_NAMES.auth.login}?${searchParams.toString()}`} />;
			// return redirect(BO_PATH_NAMES.auth.login);
		}
	}

	return (
		<Box sx={{ p: 3 }}>
			<ErrorDisplay error={error as never} title="Something went wrong!! (Authed Routes Root)" />
			<Button
				type="button"
				onClick={() => {
					revalidate();
				}}
				sx={(theme) => {
					return { margin: '0 auto', background: theme.palette.common.black };
				}}
				variant="contained"
			>
				retry
			</Button>
		</Box>
	);
};

// const DashboardPageError = () => {
// 	const error = useRouteError();

// 	// if (error instanceof Parse.Error) {
// 	// 	if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
// 	// 		return <NotFound />;
// 	// 	}
// 	// }

// 	// console.trace(error);

// 	return (
// 		<div role="alert">
// 			<h1>Something went wrong!! (Page)</h1>
// 			<pre style={{ color: 'red' }}>
// 				{JSON.stringify(error, Object.getOwnPropertyNames(error), 2).replaceAll('\\n', '\n\t\t')}
// 			</pre>
// 		</div>
// 	);
// };

export const authedRoutes: RouteObject[] = [
	{
		// loader: getRouteLoader(async () => {
		// 	if (!parseApi.parseRestClient.getSessionToken()) {
		// 		return redirect(BO_PATH_NAMES.auth.login);
		// 	}

		// 	const cachedAuthData = defaultQueryClient.getQueryData(getUserAuthDataQuery.queryKey);

		// 	const authData = cachedAuthData
		// 		? Promise.resolve(cachedAuthData)
		// 		: defaultQueryClient.fetchQuery(getUserAuthDataQuery);

		// 	return defer({
		// 		authData,
		// 	});
		// }),
		errorElement: <AuthedRoutesRootError />,
		element: (
			<Suspense fallback={<SplashScreen />}>
				<AuthGuard allowedRoles={roleSet.ABOVE_TENANT_CONTRIBUTOR}>
					<Outlet />
				</AuthGuard>
			</Suspense>
		),
		children: [
			// staff routes
			{
				path: getLastPath(BO_PATH_NAMES.staff.root),
				element: (
					<AuthGuard allowedRoles={roleSet.ABOVE_STAFF_CONTRIBUTOR}>
						<StaffDashLayout />
					</AuthGuard>
				),
				children: [
					{
						index: true,
						element: <h1>STAFF DASHBOARD</h1>,
					},
					{
						path: getLastPath(BO_PATH_NAMES.staff.posts.root),
						element: <h1>POSTS LIST HERE</h1>,
					},
					{
						path: getLastPath(BO_PATH_NAMES.staff.tenants.root),
						element: <h1>TENANTS LIST HERE</h1>,
					},
					{
						path: '*',
						element: <NotFound />,
					},
				],
			},

			// tenants routes
			{
				path: getLastPath(BO_PATH_NAMES.getTenantPaths().root),
				element: (
					<AuthGuard allowedRoles={roleSet.ABOVE_TENANT_CONTRIBUTOR}>
						{/* <TenantGuard> */}
						<Outlet />
						{/* </TenantGuard> */}
					</AuthGuard>
				),
				children: [
					{
						index: true,
						loader: getRouteLoader(async () => {
							const lastUsedTenantId = localStorageGetItem(LAST_USED_TENANT_ID_STORAGE_KEY);

							if (!lastUsedTenantId) {
								return redirect(BO_PATH_NAMES.getTenantPaths().chose);
							}

							return redirect(BO_PATH_NAMES.getTenantPaths(lastUsedTenantId).root);
						}),
						element: null,
						// element: <h1>TENANT DASHBOARD WW</h1>,
					},

					{
						path: getLastPath(BO_PATH_NAMES.getTenantPaths().chose),
						element: <h1>Chose a company to use here</h1>,
					},

					{
						path: getLastPath(BO_PATH_NAMES.getTenantPaths(':tenantId').root),
						element: <TenantDashLayout />,
						children: [
							{
								//
								index: true,
								element: <h1>TENANT DASHBOARD WW</h1>,
							},
							{
								path: getLastPath(BO_PATH_NAMES.getTenantPaths().shortUrl.root),
								element: <h1>SHORT URL MODULE</h1>,
							},
						],
					},

					{
						path: '*',
						element: <NotFound />,
					},
				],
			},

			// any other path will require auth too
			// if authenticated, a 404 pag will be rendered
			{
				path: '*',
				element: <NotFound />,
			},
		],
	},
];
