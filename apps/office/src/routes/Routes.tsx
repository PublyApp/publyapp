// import qs from 'query-string';
// import qs from 'qs';
import {
	createBrowserRouter,
	createRoutesFromElements,
	Navigate,
	Outlet,
	Route,
	RouterProvider,
} from 'react-router-dom';

import { SearchQueryParamsProvider } from '@devist/ui-react/providers/SearchQueryParamsProvider';

// import { QueryParamProvider } from 'use-query-params';
// import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6';

import Blank from '@office/containers/blank/Blank';
import DashboardLayout from '@office/layouts/dashboard/DashBoardLayout';
import { paths } from '@office/utils/paths';

import RequireAuth from '../components/RequireAuth';
import LogIn from '../containers/logIn/LogIn';
import NotFound from '../containers/notFound/NotFound';

// import WebHosts from '../containers/webHosts/WebHosts';

// import Account from './containers/account/Account';
// import Home from './containers/home/Home';

// const router = createBrowserRouter(
// 	createRoutesFromElements(
// 		<Route
// 			path="/"
// 			element={
// 				<QueryParamProvider
// 					adapter={ReactRouter6Adapter}
// 					options={{
// 						// searchStringToObject: qs.parse,
// 						// objectToSearchString: qs.stringify,
// 						searchStringToObject: (str) => {
// 							return qs.parse(str, { decode: true }) as any;
// 						},
// 						objectToSearchString: (param) => {
// 							return qs.stringify(param, { encode: false });
// 						},
// 					}}
// 				>
// 					<Outlet />
// 				</QueryParamProvider>
// 			}
// 		>
// 			<Route element={<RequireAuth />}>
// 				<Route element={<LayoutBO />}>
// 					<Route index element={<Home />} />
// 					<Route path="account" element={<Account />} />

// 					{/* ------- Showcasing the design system here */}
// 					{/* <Route path="typography" element={<TypoPage />} />
// 					<Route path="buttons" element={<ButtonsPage />} /> */}

// 					{/* ------- AI Tools ------------------------ */}
// 					<Route path={FRONT_PATH_NAMES.webHosts} element={<WebHosts />} />
// 					{/* <Route path={FRONT_PATH_NAMES.aiTools} element={<AITools />} /> */}

// 					{/* // ---- not found page ------------------------------------------------------------------- */}
// 					<Route path="*" element={<NotFound />} />
// 				</Route>
// 			</Route>

// 			<Route path="/login" element={<LogIn />} />
// 		</Route>,
// 	),
// );

const router = createBrowserRouter(
	createRoutesFromElements(
		<Route
			path="/"
			element={
				<SearchQueryParamsProvider>
					<Outlet />
				</SearchQueryParamsProvider>
			}
		>
			{/* //-------------------------------------------------------------------------------------- */}
			{/* //                                        Auth routes                                    */}
			{/* //-------------------------------------------------------------------------------------- */}
			<Route path="/login" element={<LogIn />} />

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
				{/* <Route index element={<Home />} />
				<Route path="account" element={<Account />} /> */}

				<Route path="/" element={<Navigate to={paths.dashboard.root} />} />
				<Route path={paths.dashboard.root} element={<Blank />} /* element={<WebHosts />} */ />
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
