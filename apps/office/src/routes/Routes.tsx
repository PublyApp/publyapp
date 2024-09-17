import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { env } from '../lib/env';
import QueryParamProvider from '../providers/QueryParamProvider';

import { authedRoutes } from './authed/AuthedRoutes';
import { publicRoutes } from './public/publicRoutes';

const router = createBrowserRouter(
	[
		{
			element: <QueryParamProvider />,
			children: [...authedRoutes, ...publicRoutes],
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
