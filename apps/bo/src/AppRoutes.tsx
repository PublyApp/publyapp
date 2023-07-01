import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';

import Layout from './components/layout/Layout';
import Home from './containers/home/Home';
import NotFound from './containers/notFound/NotFound';
import Account from './containers/account/Account';
import RequireAuth from './components/RequireAuth';
import LogIn from './containers/logIn/LogIn';
import TypoPage from './containers/designSystem/TypoPage';

const router = createBrowserRouter(
	createRoutesFromElements(
		<Route path="/">
			<Route element={<RequireAuth />}>
				<Route element={<Layout />}>
					<Route index element={<Home />} />
					<Route path="account" element={<Account />} />
					<Route path="typography" element={<TypoPage />} />

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
