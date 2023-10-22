import qs from 'query-string';
import {
	createBrowserRouter,
	createRoutesFromElements,
	Navigate,
	Outlet,
	Route,
	RouterProvider,
} from 'react-router-dom';
import { QueryParamProvider } from 'use-query-params';
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6';

// import Blank from '@office/containers/blank/Blank';
import Home from '@office/containers/home/Home';
import CreateWebHost from '@office/containers/webHosts/CreateWebHost';
import WebHosts from '@office/containers/webHosts/WebHosts';
import DashboardLayout from '@office/layouts/dashboard/DashBoardLayout';
import { BO_PATH_NAMES } from '@shared/utils/constants';

// import { paths } from '@office/utils/paths';

import RequireAuth from '../components/RequireAuth';
import LogIn from '../containers/logIn/LogIn';
import NotFound from '../containers/notFound/NotFound';

const router = createBrowserRouter(
	createRoutesFromElements(
		<Route
			path="/"
			element={
				<QueryParamProvider
					adapter={ReactRouter6Adapter}
					options={{
						searchStringToObject: qs.parse,
						objectToSearchString: (encodedParam) => {
							return qs.stringify(encodedParam, { arrayFormat: 'bracket', encode: false });
						},
					}}
				>
					<Outlet />
				</QueryParamProvider>
			}
		>
			{/* //-------------------------------------------------------------------------------------- */}
			{/* //                                        Auth routes                                    */}
			{/* //-------------------------------------------------------------------------------------- */}
			<Route path={BO_PATH_NAMES.logIn} element={<LogIn />} />

			{/* //-------------------------------------------------------------------------------------- */}
			{/* //                                   Dashboard routes                                    */}
			{/* //-------------------------------------------------------------------------------------- */}
			<Route
				element={
					<RequireAuth>
						<DashboardLayout>
							<Outlet />
						</DashboardLayout>
					</RequireAuth>
				}
			>
				<Route path="/" element={<Navigate to={BO_PATH_NAMES.dashboard} /* replace */ />} />
				<Route path={BO_PATH_NAMES.dashboard} element={<Home />} />
				<Route path={BO_PATH_NAMES.webHosts} element={<WebHosts />} />
				<Route path={BO_PATH_NAMES.createWebHost} element={<CreateWebHost />} />
			</Route>

			{/* // ---- not found page ------------------------------------------------------------------- */}
			<Route path="*" element={<NotFound />} />
		</Route>,
	),
);

const AppRoutes = () => {
	return <RouterProvider router={router} />;
};

export default AppRoutes;
