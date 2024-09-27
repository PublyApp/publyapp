import Parse from 'parse';
import { lazy, Suspense } from 'react';

import { Box } from '@mui/material';
import _ from 'lodash';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import {
	defer,
	Navigate,
	Outlet,
	redirect,
	useParams,
	useRevalidator,
	useRouteError,
	type RouteObject,
} from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';

import ErrorDisplay from '@/office/components/ErrorDisplay';
import NotFound from '@/office/components/NotFound';
import RevalidateButton from '@/office/components/RevalidateButton';
import SplashScreen from '@/office/components/SplashScreen';
import useHasRoles from '@/office/hooks/useHasRoles';
import LoginPage from '@/office/modules/auth/login/Login';
import {
	BO_PATH_NAMES,
	LAST_USED_TENANT_ID_STORAGE_KEY,
	roleEnum,
	roleSet,
	SESSION_TOKEN_LOCAL_STORAGE_KEY,
} from '@/shared/lib/constants';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { getIsDisabledSignupQuery, getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import { useGetClientAuthSuspenseQuery } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';
import { localStorageGetItem, localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

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
	const { state } = useRevalidator();

	if (state === 'loading') {
		return <SplashScreen />;
	}

	if (error instanceof ParseRestError) {
		if (error.code === Parse.Error.INVALID_SESSION_TOKEN) {
			localStorageUnsetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY);

			const searchParams = new URLSearchParams({
				[LoginPage.queryParamKeys.redirectCause]: LoginPage.redirectCause.INVALID_SESSION,
			});

			return <Navigate to={`${BO_PATH_NAMES.auth.login}?${searchParams.toString()}`} />;
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
	const hasRoles = useHasRoles();

	const storedTenantId = localStorageGetItem(LAST_USED_TENANT_ID_STORAGE_KEY);
	const {
		result: { data: authData },
	} = useGetClientAuthSuspenseQuery({ params: { tenantId: storedTenantId } });

	const tenantRoles = [
		roleEnum.TENANT_ADMIN,
		roleEnum.TENANT_EDITOR,
		roleEnum.TENANT_USER,
		roleEnum.TENANT_CONTRIBUTOR,
	];

	const isStaffMember = hasRoles({ allowedRoles: roleSet.ABOVE_STAFF_CONTRIBUTOR });
	const isTenantMember = hasRoles({ allowedRoles: tenantRoles });

	// case 0: worst case neither staff of tenant member
	if (!isStaffMember && !isTenantMember) {
		// TODO: logout then go to login page
		return <h1>MEGA FORBIDDEN!!</h1>;
	}

	const tenantId = authData.tenant?.objectId;
	const tenantPaths = BO_PATH_NAMES.getTenantPaths(tenantId);

	if (isStaffMember) {
		//
		if (!isTenantMember) {
			return <Navigate to={BO_PATH_NAMES.staff.root} />;
		}

		if (!tenantId) {
			return <Navigate to={BO_PATH_NAMES.staff.root} />;
		}

		return <Navigate to={tenantPaths.root} />;
	}

	if (!tenantId) {
		// TODO: create route
		return <Navigate to={BO_PATH_NAMES.getTenantPaths().chose} />;
	}

	return <Navigate to={tenantPaths.root} />;

	// console.log(isStaffMember, isTenantMember);
	// case 1: is staff, and does not use any tenantId currently
	// if (roleSet.ABOVE_STAFF_CONTRIBUTOR && !authData.tenant?.objectId) {
	// 	return <Navigate to={BO_PATH_NAMES.staff.root} />
	// }

	// if (roleSet.ABOVE_STAFF_CONTRIBUTOR && authData.)

	// return null;
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
				loader: getRouteLoader(async () => {
					const sessionToken = parseApi.parseRestClient.getSessionToken();

					if (!sessionToken) {
						return redirect(BO_PATH_NAMES.auth.login);
					}

					const lastUsedTenantId = localStorageGetItem(LAST_USED_TENANT_ID_STORAGE_KEY);

					const authDataQuery = getUserAuthDataQuery({ tenantId: lastUsedTenantId });
					const cachedAuthData = defaultQueryClient.getQueryData(authDataQuery.queryKey);

					const authData = cachedAuthData
						? Promise.resolve(cachedAuthData)
						: defaultQueryClient.fetchQuery(authDataQuery);

					return defer({
						authData,
					});
				}),
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
