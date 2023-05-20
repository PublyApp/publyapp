import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';

import Layout from './components/Layout';
import Home from './containers/home/Home';
import NotFound from './containers/notFound/NotFound';
import Account from './containers/account/Account';

const router = createBrowserRouter(
	createRoutesFromElements(
		<Route path="/" element={<Layout />}>
			<Route index element={<Home />} />
			<Route path="account" element={<Account />} />

			<Route path="*" element={<NotFound />} />
		</Route>,
	),
);

const AppRoutes = () => {
	return <RouterProvider router={router} />;
};

export default AppRoutes;
