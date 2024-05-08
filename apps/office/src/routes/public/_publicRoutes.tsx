import { Box } from '@mui/material';
import { redirect, useRouteError, type RouteObject } from 'react-router-dom';

import ErrorDisplay from '@/office/components/ErrorDisplay';
import Register from '@/office/containers/register/Register';
import AuthLayout from '@/office/layouts/auth/AuthLayout';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import parseApi from '@/ui-react/api/parse/ParseApi';

import LogIn from '../../containers/logIn/LogIn';
import { getLastPath, getRouteLoader } from '../utils';

const PublicRootError = () => {
	const error = useRouteError();

	return (
		<Box sx={{ p: 3 }}>
			<ErrorDisplay error={error as never} title="Something went wrong!! (Dash)" />
			{/* <Button
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
			</Button> */}
		</Box>
	);
};

export const publicRoutes: RouteObject[] = [
	{
		errorElement: <PublicRootError />,
		children: [
			// redirect root to dashboard
			{
				path: '/',
				loader: getRouteLoader(async () => {
					const sessionToken = parseApi.parseRestClient.getSessionToken();

					if (sessionToken) {
						return redirect(BO_PATH_NAMES.dashboard.root);
					}

					return redirect(BO_PATH_NAMES.auth.login);
				}),
			},
			// auth
			{
				path: getLastPath(BO_PATH_NAMES.auth.root),
				// * Public only loader check
				loader: getRouteLoader(async () => {
					// const storedUser = Parse.User.current();
					const sessionToken = parseApi.parseRestClient.getSessionToken();

					if (!sessionToken) {
						return null;
					}

					return redirect(BO_PATH_NAMES.dashboard.root);
				}),
				// errorElement: <PublicRootError />,
				element: <AuthLayout />,
				children: [
					{
						path: getLastPath(BO_PATH_NAMES.auth.login),
						element: <LogIn />,
						index: true,
					},
					{ path: getLastPath(BO_PATH_NAMES.auth.register), element: <Register /> },
				],
			},
		],
	},
];
