import Parse from 'parse';
import { lazy, Suspense } from 'react';

import { Box } from '@mui/material';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { Navigate, Outlet, redirect, useRouteError, type RouteObject } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';

import AuthGuard from '@/office/components/AuthGuard';
import ErrorDisplay from '@/office/components/ErrorDisplay';
import LoadingScreen from '@/office/components/LoadingScreen';
import SplashScreen from '@/office/components/SplashScreen';
import StaffDashLayout from '@/office/layouts/dashboard/staff/StaffDashLayout';
import TenantDashLayout from '@/office/layouts/dashboard/tenant/TenantDashLayout';
import { LoginRoute } from '@/office/modules/common/auth/login/LoginPage';
import { PortalRoute } from '@/office/modules/common/auth/portal/PortalPage';
import TenantChoice from '@/office/modules/common/auth/tenant-choice/TenantChoice';
import {
	BO_PATH_NAMES,
	LAST_USED_TENANT_ID_STORAGE_KEY,
	roleSet,
	SESSION_TOKEN_LOCAL_STORAGE_KEY,
} from '@/shared/lib/constants';
import { localStorageGetItem, localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

import { getLastPath, getRouteLoader } from '../utils';

const NotFound = lazy(() => {
	return import('@/office/components/NotFound');
});

const PortalPage = lazy(() => {
	return import('@/office/modules/common/auth/portal/PortalPage');
});

const UsersListPage = lazy(() => {
	return import('@/office/modules/staff/user-manager/users-list/UsersListPage');
});

const TenantsListPage = lazy(() => {
	return import('@/office/modules/staff/tenant-manager/tenants-list/TenantsListPage');
});

const AuthedRoutesRootError = () => {
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
			<ErrorDisplay error={error as never} title="Something went wrong!! (Authed Routes Root)" />
		</Box>
	);
};

export const authedRoutes: RouteObject[] = [
	{
		errorElement: <AuthedRoutesRootError />,
		element: (
			<Suspense fallback={<SplashScreen />}>
				<AuthGuard allowedRoles={roleSet.ABOVE_TENANT_USER}>
					<Outlet />
				</AuthGuard>
			</Suspense>
		),
		children: [
			// Route for determining if authed user is staff member or tenant member
			{
				path: BO_PATH_NAMES.portal,
				loader: PortalRoute.Loader,
				element: <PortalPage />,
			},

			// staff routes
			{
				path: getLastPath(BO_PATH_NAMES.staff.root),
				element: (
					<AuthGuard allowedRoles={roleSet.ABOVE_STAFF_CONTRIBUTOR}>
						<StaffDashLayout>
							<Suspense fallback={<LoadingScreen />}>
								<Outlet />
							</Suspense>
						</StaffDashLayout>
					</AuthGuard>
				),
				children: [
					{
						index: true,
						element: <h1>STAFF DASHBOARD</h1>,
					},
					{
						path: getLastPath(BO_PATH_NAMES.staff.users.root),
						element: <UsersListPage />,
					},
					{
						path: getLastPath(BO_PATH_NAMES.staff.tenants.root),
						element: <TenantsListPage />,
					},
					{
						path: getLastPath(BO_PATH_NAMES.staff.posts.root),
						element: <h1>POSTS LIST HERE</h1>,
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
					<AuthGuard allowedRoles={roleSet.ABOVE_TENANT_USER}>
						<Outlet />
					</AuthGuard>
				),
				children: [
					// essentially, check the las used tenant and use it (in the url)
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
					},

					{
						path: getLastPath(BO_PATH_NAMES.getTenantPaths().chose),
						element: <TenantChoice />,
					},

					{
						path: getLastPath(BO_PATH_NAMES.getTenantPaths(':tenantId').root),
						element: (
							<TenantDashLayout>
								<Suspense fallback={<LoadingScreen />}>
									<Outlet />
								</Suspense>
							</TenantDashLayout>
						),
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
