import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import QueryParamProvider from '../providers/QueryParamProvider';

import { dashboardRoutes } from './_dashboardRoutes';
import { publicRoutes } from './_publicRoutes';

const router = createBrowserRouter([
	{
		element: <QueryParamProvider />,
		children: [...dashboardRoutes, ...publicRoutes],
	},
]);

const Routes = () => {
	// https://github.com/remix-run/react-router/discussions/10223#discussioncomment-5909050
	return <RouterProvider router={router} />;
};

export default Routes;
