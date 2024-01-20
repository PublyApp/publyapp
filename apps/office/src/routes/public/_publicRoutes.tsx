import { redirect, type RouteObject } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { getClientAuthQuery } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

import LogIn from '../../containers/logIn/LogIn';
import { getLastPath, getRouteLoader } from '../utils';

const PublicRootError = () => {
	return (
		<div role="alert">
			<h1>Something went wrong!!</h1>
			{/* <pre style={{ color: 'red' }}>{error.message}</pre> */}
		</div>
	);
};

export const publicRoutes: RouteObject[] = [
	// auth
	{
		path: getLastPath(BO_PATH_NAMES.auth.root),
		loader: getRouteLoader(async () => {
			const storedUser = Parse.User.current();

			if (!storedUser) {
				return null;
			}

			const cachedAutData = defaultQueryClient.getQueryData(getClientAuthQuery.queryKey);

			if (!cachedAutData) {
				defaultQueryClient.prefetchQuery(getClientAuthQuery);
			}

			return redirect(BO_PATH_NAMES.dashboard.root);
		}),
		errorElement: <PublicRootError />,
		children: [
			{
				path: getLastPath(BO_PATH_NAMES.auth.login),
				element: <LogIn />,
				index: true,
			},
			{ path: getLastPath(BO_PATH_NAMES.auth.register), element: <h1>Register form</h1> },
		],
	},
];
