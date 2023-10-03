import qs from 'query-string';
// import qs from 'qs';
import { createBrowserRouter, createRoutesFromElements, Outlet, Route, RouterProvider } from 'react-router-dom';
import { QueryParamProvider } from 'use-query-params';
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6';

import { FRONT_PATH_NAMES } from '@devist/shared/utils/constants';

import LayoutBO from './components/layout/LayoutBO';
import RequireAuth from './components/RequireAuth';
import Account from './containers/account/Account';
// import AITools from './containers/aiTools/AITools';
import ButtonsPage from './containers/designSystem/ButtonsPage';
import TypoPage from './containers/designSystem/TypoPage';
import Home from './containers/home/Home';
import LogIn from './containers/logIn/LogIn';
import NotFound from './containers/notFound/NotFound';
import WebHosts from './containers/webHosts/WebHosts';

const router = createBrowserRouter(
	createRoutesFromElements(
		<Route
			path="/"
			element={
				<QueryParamProvider
					adapter={ReactRouter6Adapter}
					options={{
						// searchStringToObject: qs.parse,
						// objectToSearchString: qs.stringify,
						searchStringToObject: (str) => {
							return qs.parse(str, { decode: true }) as any;
						},
						objectToSearchString: (param) => {
							return qs.stringify(param, { encode: false });
						},
					}}
				>
					<Outlet />
				</QueryParamProvider>
			}
		>
			<Route element={<RequireAuth />}>
				<Route element={<LayoutBO />}>
					<Route index element={<Home />} />
					<Route path="account" element={<Account />} />

					{/* ------- Showcasing the design system here */}
					<Route path="typography" element={<TypoPage />} />
					<Route path="buttons" element={<ButtonsPage />} />

					{/* ------- AI Tools ------------------------ */}
					<Route path={FRONT_PATH_NAMES.webHosts} element={<WebHosts />} />
					{/* <Route path={FRONT_PATH_NAMES.aiTools} element={<AITools />} /> */}

					{/* // ---- not found page ------------------------------------------------------------------- */}
					<Route path="*" element={<NotFound />} />
				</Route>
			</Route>

			<Route path="/login" element={<LogIn />} />
		</Route>,
	),
);

const AppRoutes = () => {
	return <RouterProvider router={router} />;
};

export default AppRoutes;
