import { queryOptions } from '@tanstack/react-query';
import { createBrowserRouter, defer, RouterProvider } from 'react-router-dom';

// import { ClientException } from '@/ui-react/exceptions/ClientException';
import { getClientAuthAction } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import { getClientAuthQueryKeyBase } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

import QueryParamProvider from '../providers/QueryParamProvider';

import { dashboardRoutes } from './dashboard/_index';
import { publicRoutes } from './public/_index';
import { getRouteLoader } from './utils';

export const rootLoader = getRouteLoader(async () => {
	const query = queryOptions({
		queryKey: [getClientAuthQueryKeyBase] as const,
		queryFn: getClientAuthAction,
		// retry: (failureCount, error) => {
		// 	if (error instanceof ClientException) {
		// 		if (error.code === ClientException.AUTH_REQUIRED) {
		// 			return false;
		// 		}
		// 	}

		// 	return failureCount <= 2;
		// },
	});

	const cachedAutData = defaultQueryClient.getQueryData(query.queryKey);
	const authData = cachedAutData ? Promise.resolve(cachedAutData) : defaultQueryClient.fetchQuery(query);

	return defer({
		authData,
	});
});

const router = createBrowserRouter([
	{
		element: <QueryParamProvider />,
		loader: rootLoader,
		children: [...dashboardRoutes, ...publicRoutes],
	},
]);

const Routes = () => {
	// https://github.com/remix-run/react-router/discussions/10223#discussioncomment-5909050
	return <RouterProvider router={router} />;
};

export default Routes;
