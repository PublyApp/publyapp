import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { env } from '../lib/env';
import QueryParamProvider from '../providers/QueryParamProvider';

import { dashboardRoutes } from './dashboard/_dashboardRoutes';
import { publicRoutes } from './public/_publicRoutes';

const router = createBrowserRouter(
	[
		{
			element: <QueryParamProvider />,
			children: [...dashboardRoutes, ...publicRoutes],
		},
	],
	{
		basename: env.OFFICE_ROUTER_BASENAME,
	},
);

const Routes = () => {
	// https://github.com/remix-run/react-router/discussions/10223#discussioncomment-5909050
	return <RouterProvider router={router} />;
};

export default Routes;
