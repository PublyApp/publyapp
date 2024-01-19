// import { queryOptions } from '@tanstack/react-query';
import { createBrowserRouter /* defer, */, RouterProvider } from 'react-router-dom';

// import { getClientAuthAction } from '@/ui-react/lib/react-query/features/auth/auth.actions';
// import { getClientAuthQueryKeyBase } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
// import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

import QueryParamProvider from '../providers/QueryParamProvider';

import { dashboardRoutes } from './dashboard/_dashboardRoutes';
import { publicRoutes } from './public/_publicRoutes';

// import { getRouteLoader } from './utils';

// getRouteLoader(async () => {
// 	const query = queryOptions({
// 		queryKey: [getClientAuthQueryKeyBase] as const,
// 		queryFn: getClientAuthAction,
// 	});

// 	const cachedAutData = defaultQueryClient.getQueryData(query.queryKey);
// 	const authData = cachedAutData ? Promise.resolve(cachedAutData) : defaultQueryClient.fetchQuery(query);

// 	return defer({
// 		authData,
// 	});
// });

export const router = createBrowserRouter([
	{
		element: <QueryParamProvider />,
		// loader: rootLoader,
		children: [...dashboardRoutes, ...publicRoutes],
	},
]);

const Routes = () => {
	// https://github.com/remix-run/react-router/discussions/10223#discussioncomment-5909050
	return <RouterProvider router={router} />;
};

export default Routes;
