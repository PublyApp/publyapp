import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { env } from '../lib/env';

import { authedRoutes } from './authed/AuthedRoutes';
import { publicRoutes } from './public/PublicRoutes';

const router = createBrowserRouter([...authedRoutes, ...publicRoutes], {
	basename: env.OFFICE_ROUTER_BASENAME,
	future: {
		v7_relativeSplatPath: true,
		v7_fetcherPersist: true,
		v7_normalizeFormMethod: true,
		v7_partialHydration: true,
		v7_skipActionErrorRevalidation: true,
	},
});

const Routes = () => {
	// https://github.com/remix-run/react-router/discussions/10223#discussioncomment-5909050
	return (
		<RouterProvider
			router={router}
			future={{
				v7_startTransition: true,
			}}
		/>
	);
};

export default Routes;
